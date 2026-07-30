using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Social.Domain.Entities;
using Social.Infrastructure.Data;

namespace Social.API.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        private readonly SocialDbContext _context;

        public ChatHub(SocialDbContext context)
        {
            _context = context;
        }

        public async Task LoadPrivateHistory(string targetUserId)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(myIdString, out Guid myId) || !Guid.TryParse(targetUserId, out Guid targetId)) return;

            var messages = await _context.Messages
                .Where(m => ((m.SenderId == myId && m.ReceiverId == targetId) ||
                             (m.SenderId == targetId && m.ReceiverId == myId))
                            && !m.DeletedForIds.Contains(myIdString)) // CHẶN NHỮNG TIN ĐÃ BỊ MÌNH XÓA
                .OrderByDescending(m => m.CreatedAt)
                .Take(50)
                .ToListAsync();

            var chatHistory = messages.OrderBy(m => m.CreatedAt).ToList();
            await Clients.Caller.SendAsync("LoadHistory", chatHistory);
        }

        public async Task SendPrivateMessage(string targetUserId, string encryptedMessage)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var username = Context.User?.FindFirst(ClaimTypes.Name)?.Value ?? "Ẩn danh";

            if (Guid.TryParse(myIdString, out Guid myId) && Guid.TryParse(targetUserId, out Guid targetId))
            {
                var msg = new Message
                {
                    SenderId = myId,
                    SenderUsername = username,
                    ReceiverId = targetId,
                    Content = encryptedMessage,
                    IsRead = false,
                    IsRecalled = false,
                    CreatedAt = DateTime.UtcNow
                };

                _context.Messages.Add(msg);
                await _context.SaveChangesAsync();
                // LƯU THÔNG BÁO CHAT VÀO CHUÔNG (CHỐNG SPAM)
                // Chỉ tạo thông báo mới nếu trước đó chưa có thông báo "Chat" nào TỪ NGƯỜI NÀY mà chưa được đọc.
                var existingNotif = await _context.Notifications.FirstOrDefaultAsync(n =>
                    n.UserId == targetId &&
                    n.SenderId == myId &&
                    n.Type == "Chat" &&
                    !n.IsRead);

                if (existingNotif == null)
                {
                    var notif = new Notification
                    {
                        UserId = targetId,
                        SenderId = myId,
                        Type = "Chat",
                        RelatedId = myId, // Nhét ID của người gửi vào để Frontend biết nhảy sang chat với ai
                        Content = $"Bạn có tin nhắn mới từ {username}"
                    };
                    _context.Notifications.Add(notif);
                    await _context.SaveChangesAsync();

                    // Bắn SignalR kích hoạt cái Chuông 🔔
                    await Clients.User(targetUserId).SendAsync("ReceiveNotification", notif.Content, notif.Type, notif.SenderId.ToString(), notif.RelatedId.ToString());
                }
                string normalizedTargetId = targetId.ToString();

                // ĐÃ SỬA: Ném luôn cái ID của tin nhắn về để Client biết đường mà thu hồi
                await Clients.User(normalizedTargetId).SendAsync("ReceiveMessage", msg.Id.ToString(), myId.ToString(), username, encryptedMessage, false);
                await Clients.Caller.SendAsync("ReceiveMessage", msg.Id.ToString(), myId.ToString(), username, encryptedMessage, false);
            }
        }

        // --- CÁC HÀM DÀNH CHO GROUP CHAT ---

        // 1. Khi mở Frontend lên, tự động Join vào các tần số Group đang tham gia
        public async Task JoinGroup(string groupId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupId);
        }

        // 2. Load lịch sử tin nhắn của Nhóm
        public async Task LoadGroupHistory(string groupIdStr)
        {
            if (!Guid.TryParse(groupIdStr, out Guid groupId)) return;

            var messages = await _context.Messages
                .Where(m => m.GroupId == groupId)
                .OrderByDescending(m => m.CreatedAt)
                .Take(50)
                .ToListAsync();

            var chatHistory = messages.OrderBy(m => m.CreatedAt).ToList();
            await Clients.Caller.SendAsync("LoadHistory", chatHistory);
        }

        // 3. Gửi tin nhắn vào Nhóm
        public async Task SendGroupMessage(Guid groupId, string encryptedMessage)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var username = Context.User?.FindFirst(ClaimTypes.Name)?.Value ?? "Ai đó";
            if (!Guid.TryParse(myIdString, out Guid myId)) return;

            var msg = new Message
            {
                SenderId = myId,
                GroupId = groupId,
                SenderUsername = username,
                Content = encryptedMessage
            };

            _context.Messages.Add(msg);
            await _context.SaveChangesAsync();

            // Gửi tin nhắn real-time cho cả nhóm
            await Clients.Group(groupId.ToString()).SendAsync("ReceiveGroupMessage", groupId, msg.Id, myId, username, encryptedMessage, false);

            // ====================================================
            // LƯU THÔNG BÁO CHUÔNG CHO TỪNG THÀNH VIÊN (CHỐNG SPAM)
            // ====================================================
            var group = await _context.ChatGroups.FindAsync(groupId);
            var groupName = group?.Name ?? "Nhóm";

            // Lấy tất cả thành viên (trừ người vừa gửi)
            var members = await _context.GroupMembers.Where(gm => gm.GroupId == groupId && gm.UserId != myId).ToListAsync();

            foreach (var member in members)
            {
                // Bỏ qua nếu thành viên này đã bị Cấm chat hoặc Tắt thông báo
                if (member.IsMuted) continue;

                // Kiểm tra xem đã có thông báo nhóm này chưa
                var existingNotif = await _context.Notifications.FirstOrDefaultAsync(n =>
                    n.UserId == member.UserId &&
                    n.Type == "GroupChat" &&
                    n.RelatedId == groupId &&
                    !n.IsRead);

                if (existingNotif == null)
                {
                    var notif = new Notification
                    {
                        UserId = member.UserId,
                        SenderId = myId,
                        Type = "GroupChat",
                        RelatedId = groupId, // Nhét ID Nhóm vào đây để mút chỉ đường
                        Content = $"Có tin nhắn mới trong nhóm {groupName}"
                    };
                    _context.Notifications.Add(notif);
                    await _context.SaveChangesAsync();

                    // Bóp cò SignalR cho cái Chuông 🔔
                    await Clients.User(member.UserId.ToString()).SendAsync("ReceiveNotification", notif.Content, notif.Type, notif.SenderId.ToString(), notif.RelatedId.ToString());
                }
            }
        }

        public async Task SendTypingState(string targetUserId, bool isTyping)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(myIdString, out Guid myId) && Guid.TryParse(targetUserId, out Guid targetId))
            {
                await Clients.User(targetId.ToString()).SendAsync("ReceiveTypingState", myId.ToString(), isTyping);
            }
        }

        public async Task MarkAsRead(string targetUserId)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(myIdString, out Guid myId) && Guid.TryParse(targetUserId, out Guid targetId))
            {
                var unreadMsgs = await _context.Messages
                    .Where(m => m.SenderId == targetId && m.ReceiverId == myId && !m.IsRead)
                    .ToListAsync();

                if (unreadMsgs.Any())
                {
                    foreach (var m in unreadMsgs) m.IsRead = true;
                    await _context.SaveChangesAsync();
                    await Clients.User(targetId.ToString()).SendAsync("ReceiveReadReceipt", myId.ToString());
                }
            }
        }
        // TÍNH NĂNG MỚI: XÓA 1 PHÍA (DELETE FOR ME)
        public async Task DeleteMessageForMe(string messageIdStr)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(myIdString, out Guid myId) && Guid.TryParse(messageIdStr, out Guid messageId))
            {
                var msg = await _context.Messages.FindAsync(messageId);
                if (msg == null) return;

                // Đóng dấu ID của mình vào chuỗi DeletedForIds để lần sau load lịch sử không lấy lên nữa
                if (!msg.DeletedForIds.Contains(myIdString))
                {
                    msg.DeletedForIds += myIdString + ",";
                    await _context.SaveChangesAsync();
                }

                // Chỉ bắn tín hiệu về cho ĐÚNG 1 MÌNH MÁY MÌNH để JS ẩn thẻ HTML tin nhắn đó đi
                await Clients.Caller.SendAsync("MessageDeletedForMe", messageIdStr);
            }
        }
        // TÍNH NĂNG MỚI: API GỌI THU HỒI TIN NHẮN (Đã hỗ trợ Nhóm)
        public async Task RecallMessage(string targetUserId, string messageIdStr)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(myIdString, out Guid myId) && Guid.TryParse(messageIdStr, out Guid messageId))
            {
                var msg = await _context.Messages.FirstOrDefaultAsync(m => m.Id == messageId && m.SenderId == myId);
                if (msg != null && !msg.IsRecalled)
                {
                    msg.IsRecalled = true;
                    await _context.SaveChangesAsync();

                    // Nếu là tin nhắn nhóm, phát loa cho toàn nhóm
                    if (msg.GroupId != null)
                    {
                        await Clients.Group(msg.GroupId?.ToString()!).SendAsync("ReceiveMessageRecalled", messageIdStr);
                    }
                    else // Nếu là 1-1, phát cho máy mình và máy bạn
                    {
                        await Clients.User(targetUserId).SendAsync("ReceiveMessageRecalled", messageIdStr);
                        await Clients.Caller.SendAsync("ReceiveMessageRecalled", messageIdStr);
                    }
                }
            }
        }
        // TÍNH NĂNG MỚI: SỬA TIN NHẮN
        public async Task EditMessage(string targetUserId, string messageIdStr, string newEncryptedContent)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(myIdString, out Guid myId) && Guid.TryParse(targetUserId, out Guid targetId) && Guid.TryParse(messageIdStr, out Guid messageId))
            {
                var msg = await _context.Messages.FirstOrDefaultAsync(m => m.Id == messageId && m.SenderId == myId);
                if (msg != null && !msg.IsRecalled)
                {
                    msg.Content = newEncryptedContent;
                    msg.IsEdited = true;
                    await _context.SaveChangesAsync();

                    // Bắn tín hiệu sang máy người nhận và máy mình
                    await Clients.User(targetId.ToString()).SendAsync("ReceiveMessageEdited", messageIdStr, newEncryptedContent);
                    await Clients.Caller.SendAsync("ReceiveMessageEdited", messageIdStr, newEncryptedContent);
                }
            }
        }
        // TÍNH NĂNG MỚI: PHÁT TÍN HIỆU GÕ PHÍM CHO TOÀN NHÓM
        public async Task SendGroupTypingState(string groupIdStr, bool isTyping)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var username = Context.User?.Identity?.Name ?? "User";

            if (Guid.TryParse(myIdString, out Guid myId) && Guid.TryParse(groupIdStr, out Guid groupId))
            {
                // Phát loa cho cả nhóm biết ai đang gõ
                await Clients.Group(groupIdStr).SendAsync("ReceiveGroupTypingState", groupIdStr, myId.ToString(), username, isTyping);
            }
        }
        // SIGNALING CHO WEBRTC (GỌI VIDEO/AUDIO)
        // 1. Máy A bắt đầu gọi máy B
        public async Task CallUser(string targetUserId, bool isVideoCall)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var myName = Context.User?.Identity?.Name ?? "Ai đó";

            if (Guid.TryParse(myIdString, out Guid myId))
            {
                // Réo chuông máy B
                await Clients.User(targetUserId).SendAsync("ReceiveCall", myId.ToString(), myName, isVideoCall);
            }
        }

        // 2. Máy B bấm nút Chấp nhận
        public async Task AcceptCall(string targetUserId)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (myIdString != null)
            {
                await Clients.User(targetUserId).SendAsync("CallAccepted", myIdString);
            }
        }

        // 3. Máy B bấm nút Từ chối
        public async Task RejectCall(string targetUserId)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (myIdString != null)
            {
                await Clients.User(targetUserId).SendAsync("CallRejected", myIdString);
            }
        }

        // 4. Một trong 2 người cúp máy giữa chừng
        public async Task EndCall(string targetUserId)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (myIdString != null)
            {
                await Clients.User(targetUserId).SendAsync("CallEnded", myIdString);
            }
        }

        // 5. Đường ống luân chuyển tọa độ mạng (Offer, Answer, ICE Candidates)
        // Đây là trái tim của WebRTC Signaling
        public async Task SendWebRTCData(string targetUserId, string type, string payload)
        {
            var myIdString = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (myIdString != null)
            {
                await Clients.User(targetUserId).SendAsync("ReceiveWebRTCData", myIdString, type, payload);
            }
        }
    }
}
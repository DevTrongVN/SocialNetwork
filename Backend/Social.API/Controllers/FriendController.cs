using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Social.Domain.Entities;
using Social.Infrastructure.Data;
using Microsoft.AspNetCore.SignalR;
using Social.API.Hubs;

namespace Social.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class FriendController : ControllerBase
    {
        private readonly SocialDbContext _context;
        private readonly IHubContext<ChatHub> _hubContext;

        public FriendController(SocialDbContext context, IHubContext<ChatHub> hubContext)
        {
            _context = context;
            _hubContext = hubContext;
        }

        // 1. GỬI LỜI MỜI KẾT BẠN
        [HttpPost("request/{targetId}")]
        public async Task<IActionResult> SendRequest(Guid targetId)
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));
            if (myId == targetId) return BadRequest("Không thể tự kết bạn!");

            var existing = await _context.Friendships.FirstOrDefaultAsync(f =>
                (f.RequesterId == myId && f.ReceiverId == targetId) ||
                (f.RequesterId == targetId && f.ReceiverId == myId));

            if (existing != null) return BadRequest("Đã gửi lời mời hoặc đã là bạn bè!");

            var friendship = new Friendship { RequesterId = myId, ReceiverId = targetId, Status = 0 };
            _context.Friendships.Add(friendship);

            var myUser = await _context.Users.FindAsync(myId);
            string myName = myUser?.Username ?? "Ai đó";

            // Tạo thông báo
            var notif = new Notification
            {
                UserId = targetId,
                SenderId = myId,
                Type = "Friend",
                RelatedId = myId,
                Content = $"{myName} đã gửi cho bạn một lời mời kết bạn!"
            };
            _context.Notifications.Add(notif);
            await _context.SaveChangesAsync();

            // ===> BÓP CÒ SIGNALR REALTIME <===
            await _hubContext.Clients.User(targetId.ToString())
                .SendAsync("ReceiveNotification", notif.Content, notif.Type, notif.SenderId.ToString(), notif.RelatedId.ToString());

            return Ok(new { message = "Đã gửi lời mời kết bạn!" });
        }

        // 2. ĐỒNG Ý KẾT BẠN
        [HttpPost("accept/{targetId}")]
        public async Task<IActionResult> AcceptRequest(Guid targetId)
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));

            // Tìm lời mời người kia gửi cho mình
            var existing = await _context.Friendships.FirstOrDefaultAsync(f => f.RequesterId == targetId && f.ReceiverId == myId && f.Status == 0);
            if (existing == null) return BadRequest("Không có lời mời nào để chấp nhận!");

            existing.Status = 1; // Chuyển sang trạng thái "Đã là bạn bè"

            var notif = new Notification { UserId = targetId, Content = $"{User.FindFirstValue(ClaimTypes.Name)} đã chấp nhận lời mời kết bạn!" };
            _context.Notifications.Add(notif);
            await _context.SaveChangesAsync();

            await _hubContext.Clients.User(targetId.ToString()).SendAsync("ReceiveNotification", notif.Content);
            return Ok(new { message = "Hai bạn đã trở thành bạn bè!" });
        }

        // 3. HỦY / TỪ CHỐI / XÓA BẠN BÈ
        [HttpPost("remove/{targetId}")]
        public async Task<IActionResult> RemoveFriend(Guid targetId)
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));

            var existing = await _context.Friendships.FirstOrDefaultAsync(f =>
                (f.RequesterId == myId && f.ReceiverId == targetId) ||
                (f.RequesterId == targetId && f.ReceiverId == myId));

            if (existing == null) return BadRequest("Không có quan hệ bạn bè để xóa!");

            _context.Friendships.Remove(existing);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Đã xóa thành công!" });
        }
        // 4. LẤY DANH SÁCH LỜI MỜI KẾT BẠN (Đã nhận & Đã gửi)
        [HttpGet("requests")]
        public async Task<IActionResult> GetFriendRequests()
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));

            // Lời mời MÌNH NHẬN ĐƯỢC (Chờ mình duyệt)
            var received = await _context.Friendships
                .Where(f => f.ReceiverId == myId && f.Status == 0)
                .Join(_context.Users, f => f.RequesterId, u => u.Id, (f, u) => new { u.Id, u.Username, u.Email })
                .ToListAsync();

            // Lời mời MÌNH ĐÃ GỬI ĐI (Chờ người khác duyệt)
            var sent = await _context.Friendships
                .Where(f => f.RequesterId == myId && f.Status == 0)
                .Join(_context.Users, f => f.ReceiverId, u => u.Id, (f, u) => new { u.Id, u.Username, u.Email })
                .ToListAsync();

            return Ok(new { received, sent });
        }

        // 5. LẤY DANH SÁCH BẠN BÈ CHÍNH THỨC OF A USER
        [HttpGet("list/{userId}")]
        public async Task<IActionResult> GetFriendsList(Guid userId)
        {
            var friends = await _context.Friendships
                .Where(f => f.Status == 1 && (f.RequesterId == userId || f.ReceiverId == userId))
                .Select(f => f.RequesterId == userId ? f.ReceiverId : f.RequesterId)
                .Join(_context.Users, id => id, u => u.Id, (id, u) => new { u.Id, u.Username, u.Email })
                .ToListAsync();

            return Ok(friends);
        }
    }

}
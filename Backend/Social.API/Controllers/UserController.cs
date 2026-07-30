using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Social.Application.DTOs;
using Social.Domain.Entities;
using Social.Infrastructure.Data;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Social.API.Controllers
{
    public class SearchHistoryRequest
    {
        public string? Keyword { get; set; }
        public Guid? TargetUserId { get; set; }
    }
    public class UpdateSettingsRequest
    {
        public string? Username { get; set; }
        public string? Bio { get; set; } // Nhận Tiểu sử
        public int ProfileVisibility { get; set; }
        public int FriendListVisibility { get; set; }
        public int PostDefaultVisibility { get; set; }
    }

    public class ChangePasswordRequest
    {
        public string OldPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    public class UpdateAvatarRequest
    {
        public string AvatarUrl { get; set; } = string.Empty;
    }

    public class UpdateCoverRequest
    {
        public string CoverUrl { get; set; } = string.Empty;
    }

    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class UserController : ControllerBase
    {
        private readonly SocialDbContext _context;
        private readonly IConfiguration _configuration;

        public UserController(SocialDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        [HttpGet("me")]
        public async Task<IActionResult> GetMe()
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var user = await _context.Users.FindAsync(myId);
            if (user == null || user.IsDeleted) return NotFound("Không tìm thấy người dùng!");

            return Ok(new
            {
                id = user.Id,
                username = user.Username,
                email = user.Email,
                avatarUrl = user.AvatarUrl,
                coverUrl = user.CoverUrl, // Trả Ảnh Bìa
                bio = user.Bio,           // Trả Tiểu Sử
                role = user.Role,
                profileVisibility = user.ProfileVisibility,
                friendListVisibility = user.FriendListVisibility,
                postDefaultVisibility = user.PostDefaultVisibility
            });
        }

        [HttpGet("search")]
        public async Task<IActionResult> SearchByEmail([FromQuery] string email)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            if (string.IsNullOrWhiteSpace(email)) return BadRequest("Email không được để trống!");

            var blockedIds = await _context.Blocks.Where(b => b.BlockerId == myId || b.BlockedId == myId).Select(b => b.BlockerId == myId ? b.BlockedId : b.BlockerId).ToListAsync();
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email.Trim().ToLower() && !u.IsDeleted && !blockedIds.Contains(u.Id));

            if (user == null) return NotFound("Không tìm thấy người dùng có Email này!");
            return Ok(new { id = user.Id, username = user.Username, email = user.Email, avatarUrl = user.AvatarUrl });
        }

        [HttpGet("search-users")]
        public async Task<IActionResult> SearchUsers([FromQuery] string keyword)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            if (string.IsNullOrWhiteSpace(keyword)) return Ok(new List<object>());

            var blockedIds = await _context.Blocks.Where(b => b.BlockerId == myId || b.BlockedId == myId).Select(b => b.BlockerId == myId ? b.BlockedId : b.BlockerId).ToListAsync();

            // Tìm theo Tên hoặc Email, tối đa 10 người
            var users = await _context.Users
                .Where(u => !u.IsDeleted && !blockedIds.Contains(u.Id) &&
                           (u.Username.Contains(keyword) || u.Email.Contains(keyword)))
                .Take(10)
                .Select(u => new { id = u.Id, username = u.Username, avatarUrl = u.AvatarUrl })
                .ToListAsync();

            return Ok(users);
        }

        [HttpGet("suggested")]
        public async Task<IActionResult> GetSuggestedUsers()
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // 1. Lọc những người đã chặn
            var blockedIds = await _context.Blocks.Where(b => b.BlockerId == myId || b.BlockedId == myId).Select(b => b.BlockerId == myId ? b.BlockedId : b.BlockerId).ToListAsync();

            // 2. Lọc những người ĐÃ LÀ BẠN BÈ hoặc ĐANG GỬI LỜI MỜI (Giải quyết câu hỏi số 2 của bạn)
            var involvedIds = await _context.Friendships.Where(f => f.RequesterId == myId || f.ReceiverId == myId).Select(f => f.RequesterId == myId ? f.ReceiverId : f.RequesterId).ToListAsync();

            // 3. Lọc những người MÌNH ĐÃ THEO DÕI RỒI (Giải quyết dứt điểm lỗi nút xanh)
            var followingIds = await _context.Follows.Where(f => f.FollowerId == myId).Select(f => f.FollowingId).ToListAsync();

            // Gộp tất cả lại thành "Danh sách loại trừ"
            var excludeIds = blockedIds.Concat(involvedIds).Concat(followingIds).Concat(new[] { myId }).Distinct();

            // Lấy 5 người ngẫu nhiên KHÔNG NẰM trong danh sách loại trừ
            var suggestedUsers = await _context.Users
                .Where(u => !excludeIds.Contains(u.Id) && !u.IsDeleted).OrderBy(u => Guid.NewGuid()).Take(5)
                .Select(u => new { id = u.Id, username = u.Username, avatarUrl = u.AvatarUrl }).ToListAsync();

            return Ok(suggestedUsers);
        }

        [HttpGet("profile/{targetUserId}")]
        public async Task<IActionResult> GetUserProfile(Guid targetUserId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            bool isBlocked = await _context.Blocks.AnyAsync(b => (b.BlockerId == myId && b.BlockedId == targetUserId) || (b.BlockerId == targetUserId && b.BlockedId == myId));
            if (isBlocked) return StatusCode(403, new { message = "Bạn không thể xem trang cá nhân này do hạn chế quyền truy cập (Đã bị chặn)." });

            var targetUser = await _context.Users.FindAsync(targetUserId);
            if (targetUser == null || targetUser.IsDeleted) return NotFound("Người dùng không tồn tại!");

            string friendStatus = "none";
            var friendship = await _context.Friendships.FirstOrDefaultAsync(f => (f.RequesterId == myId && f.ReceiverId == targetUserId) || (f.RequesterId == targetUserId && f.ReceiverId == myId));
            if (friendship != null)
            {
                if (friendship.Status == 1) friendStatus = "friend";
                else if (friendship.RequesterId == myId) friendStatus = "pending_sent";
                else friendStatus = "pending_received";
            }

            if (myId != targetUserId)
            {
                if (targetUser.ProfileVisibility == 2) return StatusCode(403, new { message = "Trang cá nhân này ở chế độ Riêng tư (Chỉ mình tôi)." });
                if (targetUser.ProfileVisibility == 1 && friendStatus != "friend") return StatusCode(403, new { message = "Trang cá nhân này chỉ hiển thị với Bạn bè." });
            }

            bool isFollowing = await _context.Follows.AnyAsync(f => f.FollowerId == myId && f.FollowingId == targetUserId);
            string displayEmail = (myId != targetUserId && targetUser.EmailVisibility == 2) ? "🔒 Email đã ẩn" : targetUser.Email;

            return Ok(new
            {
                id = targetUser.Id,
                username = targetUser.Username,
                email = displayEmail,
                avatarUrl = targetUser.AvatarUrl,
                coverUrl = targetUser.CoverUrl, // Trả Ảnh Bìa
                bio = targetUser.Bio,           // Trả Tiểu Sử
                isFollowing = isFollowing,
                friendStatus = friendStatus,
                profileVisibility = targetUser.ProfileVisibility
            });
        }

        [HttpPut("settings")]
        public async Task<IActionResult> UpdateSettings([FromBody] UpdateSettingsRequest request)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var user = await _context.Users.FindAsync(myId);
            if (user == null || user.IsDeleted) return NotFound("Người dùng không tồn tại.");

            bool isNameChanged = !string.IsNullOrWhiteSpace(request.Username) && user.Username != request.Username.Trim();
            if (isNameChanged)
            {
                string newName = request.Username!.Trim();
                user.Username = newName;
                var myPosts = await _context.Posts.Where(p => p.UserId == myId).ToListAsync();
                foreach (var p in myPosts) p.AuthorName = newName;
                var myComments = await _context.Comments.Where(c => c.UserId == myId).ToListAsync();
                foreach (var c in myComments) c.AuthorName = newName;
                var myMessages = await _context.Messages.Where(m => m.SenderId == myId).ToListAsync();
                foreach (var m in myMessages) m.SenderUsername = newName;
            }

            // Gán dữ liệu Bio vào DB
            if (request.Bio != null) user.Bio = request.Bio.Trim();

            user.ProfileVisibility = request.ProfileVisibility;
            user.FriendListVisibility = request.FriendListVisibility;
            user.PostDefaultVisibility = request.PostDefaultVisibility;

            await _context.SaveChangesAsync();

            string? newToken = null;
            if (isNameChanged)
            {
                var tokenHandler = new JwtSecurityTokenHandler();
                var key = Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!);
                var tokenDescriptor = new SecurityTokenDescriptor
                {
                    Subject = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.Username) }),
                    Expires = DateTime.UtcNow.AddDays(7),
                    SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
                };
                newToken = tokenHandler.WriteToken(tokenHandler.CreateToken(tokenDescriptor));
            }
            return Ok(new { message = "Lưu cài đặt thành công!", token = newToken });
        }

        [HttpPut("password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var user = await _context.Users.FindAsync(myId);
            if (user == null || user.IsDeleted) return NotFound("Người dùng không tồn tại.");

            if (!BCrypt.Net.BCrypt.Verify(request.OldPassword, user.PasswordHash)) return BadRequest("Mật khẩu cũ không chính xác!");
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _context.SaveChangesAsync();

            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!);
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.Username) }),
                Expires = DateTime.UtcNow.AddDays(7),
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var newToken = tokenHandler.WriteToken(tokenHandler.CreateToken(tokenDescriptor));
            return Ok(new { message = "Đổi mật khẩu thành công!", token = newToken });
        }

        [HttpPut("avatar")]
        public async Task<IActionResult> UpdateAvatar([FromBody] UpdateAvatarRequest request)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var user = await _context.Users.FindAsync(myId);
            if (user == null || user.IsDeleted) return NotFound("Người dùng không tồn tại.");

            user.AvatarUrl = request.AvatarUrl;
            await _context.SaveChangesAsync();
            return Ok(new { message = "Cập nhật ảnh đại diện thành công!", avatarUrl = user.AvatarUrl });
        }

        [HttpPut("cover")]
        public async Task<IActionResult> UpdateCover([FromBody] UpdateCoverRequest request)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var user = await _context.Users.FindAsync(myId);
            if (user == null || user.IsDeleted) return NotFound("Người dùng không tồn tại.");

            user.CoverUrl = request.CoverUrl;
            await _context.SaveChangesAsync();
            return Ok(new { message = "Cập nhật ảnh bìa thành công!", coverUrl = user.CoverUrl });
        }

        [HttpGet("recent-chats")]
        public async Task<IActionResult> GetRecentChats()
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // 1. Lấy danh sách bạn bè
            var friendIds = await _context.Friendships
                .Where(f => f.Status == 1 && (f.RequesterId == myId || f.ReceiverId == myId))
                .Select(f => f.RequesterId == myId ? f.ReceiverId : f.RequesterId)
                .ToListAsync();

            // 2. Lấy những người ĐÃ TỪNG NHẮN TIN
            var chattedIdsNullable = await _context.Messages
                .Where(m => m.SenderId == myId || m.ReceiverId == myId)
                .Select(m => m.SenderId == myId ? m.ReceiverId : m.SenderId)
                .Distinct()
                .ToListAsync();

            // Lọc bỏ null an toàn
            var chattedIds = chattedIdsNullable
                .Where(id => id.HasValue)
                .Select(id => id!.Value)
                .ToList();

            // 3. Gộp lại
            var allContactIds = friendIds.Concat(chattedIds).Distinct().ToList();

            var contacts = await _context.Users
                .Where(u => allContactIds.Contains(u.Id) && !u.IsDeleted)
                .Select(u => new {
                    id = u.Id,
                    username = u.Username,
                    avatarUrl = u.AvatarUrl,
                    isFriend = friendIds.Contains(u.Id)
                })
                .ToListAsync();

            return Ok(contacts);
        }


        [HttpGet("search-history")]
        public async Task<IActionResult> GetSearchHistory()
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // Lấy 10 lịch sử gần nhất, kèm theo Avatar + Tên nếu đó là lịch sử tìm người dùng
            var history = await _context.SearchHistories
                .Where(sh => sh.UserId == myId)
                .OrderByDescending(sh => sh.CreatedAt)
                .Take(10)
                .Select(sh => new {
                    id = sh.Id,
                    keyword = sh.Keyword,
                    targetUserId = sh.TargetUserId,
                    targetUser = sh.TargetUserId.HasValue
                        ? _context.Users.Where(u => u.Id == sh.TargetUserId.Value).Select(u => new { u.Id, u.Username, u.AvatarUrl }).FirstOrDefault()
                        : null
                })
                .ToListAsync();

            return Ok(history);
        }

        [HttpPost("search-history")]
        public async Task<IActionResult> SaveSearchHistory([FromBody] SearchHistoryRequest request)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // Xóa lịch sử cũ nếu tìm lại từ khóa / người dùng đã từng tìm (để đẩy nó lên đầu)
            var existing = await _context.SearchHistories.FirstOrDefaultAsync(sh =>
                sh.UserId == myId &&
                ((request.TargetUserId.HasValue && sh.TargetUserId == request.TargetUserId) ||
                 (!string.IsNullOrWhiteSpace(request.Keyword) && sh.Keyword == request.Keyword)));

            if (existing != null) _context.SearchHistories.Remove(existing);

            var newHistory = new SearchHistory
            {
                UserId = myId,
                Keyword = request.Keyword,
                TargetUserId = request.TargetUserId,
                CreatedAt = DateTime.UtcNow
            };

            _context.SearchHistories.Add(newHistory);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Đã lưu lịch sử" });
        }

        [HttpDelete("search-history/{historyId}")]
        public async Task<IActionResult> DeleteSearchHistory(Guid historyId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var history = await _context.SearchHistories.FirstOrDefaultAsync(sh => sh.Id == historyId && sh.UserId == myId);
            if (history != null)
            {
                _context.SearchHistories.Remove(history);
                await _context.SaveChangesAsync();
            }
            return Ok(new { message = "Đã xóa lịch sử" });
        }
        [HttpGet("chat-data/{targetId}")]
        public async Task<IActionResult> GetFullChatData(Guid targetId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // Lấy TẤT CẢ tin nhắn chưa bị thu hồi của 2 người, sắp xếp từ cũ tới mới
            var messages = await _context.Messages
                .Where(m => !m.IsRecalled && ((m.SenderId == myId && m.ReceiverId == targetId) || (m.SenderId == targetId && m.ReceiverId == myId)))
                .OrderBy(m => m.CreatedAt)
                .Select(m => new {
                    id = m.Id,
                    senderId = m.SenderId,
                    content = m.Content, // Cục mã hóa E2EE
                    createdAt = m.CreatedAt
                })
                .ToListAsync();

            return Ok(messages);
        }
    }
}
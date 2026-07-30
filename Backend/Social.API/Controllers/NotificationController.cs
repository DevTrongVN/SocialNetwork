using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Social.Infrastructure.Data;

namespace Social.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class NotificationController : ControllerBase
    {
        private readonly SocialDbContext _context;

        public NotificationController(SocialDbContext context)
        {
            _context = context;
        }

        // LẤY DANH SÁCH THÔNG BÁO CỦA TÔI
        [HttpGet]
        public async Task<IActionResult> GetMyNotifications()
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var notifs = await _context.Notifications
                .Where(n => n.UserId == myId)
                .OrderByDescending(n => n.CreatedAt)
                .Take(30) // Lấy 30 thông báo gần nhất
                .ToListAsync();

            var unreadCount = notifs.Count(n => !n.IsRead);

            return Ok(new { unreadCount, notifications = notifs });
        }

        // ĐÁNH DẤU TẤT CẢ ĐÃ ĐỌC
        [HttpPut("read-all")]
        public async Task<IActionResult> MarkAllAsRead()
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));
            var unreadNotifs = await _context.Notifications.Where(n => n.UserId == myId && !n.IsRead).ToListAsync();

            foreach (var n in unreadNotifs) n.IsRead = true;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Đã đánh dấu đọc tất cả!" });
        }
    }
}
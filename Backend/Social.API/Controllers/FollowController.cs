using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Social.API.Hubs;
using Social.Domain.Entities;
using Social.Infrastructure.Data;

namespace Social.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class FollowController : ControllerBase
    {
        private readonly SocialDbContext _context;
        private readonly IHubContext<ChatHub> _hubContext; // Tiêm SignalR vào đây

        public FollowController(SocialDbContext context, IHubContext<ChatHub> hubContext)
        {
            _context = context;
            _hubContext = hubContext;
        }

        [HttpPost("{targetUserId}")]
        public async Task<IActionResult> ToggleFollow(Guid targetUserId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            if (myId == targetUserId)
                return BadRequest("Bạn không thể tự theo dõi chính mình!");

            var targetUser = await _context.Users.FindAsync(targetUserId);
            if (targetUser == null) return NotFound("Người dùng không tồn tại.");

            var myUser = await _context.Users.FindAsync(myId);
            string myName = myUser?.Username ?? "Ai đó";

            var existingFollow = await _context.Follows
                .FirstOrDefaultAsync(f => f.FollowerId == myId && f.FollowingId == targetUserId);

            if (existingFollow != null)
            {
                _context.Follows.Remove(existingFollow);
                await _context.SaveChangesAsync();
                return Ok(new { message = "Đã hủy theo dõi!" });
            }
            else
            {
                var follow = new Follow { FollowerId = myId, FollowingId = targetUserId };
                _context.Follows.Add(follow);

                // 1. Tạo thông báo trong Database
                var notif = new Notification
                {
                    UserId = targetUserId,
                    SenderId = myId,
                    Type = "Friend", // Để Frontend chuyển hướng sang trang profile
                    RelatedId = myId,
                    Content = $"{myName} đã bắt đầu theo dõi bạn!"
                };
                _context.Notifications.Add(notif);
                await _context.SaveChangesAsync();

                // 2. BÓP CÒ SIGNALR: Bắn trực tiếp đến máy người được follow
                await _hubContext.Clients.User(targetUserId.ToString())
                    .SendAsync("ReceiveNotification", notif.Content, notif.Type, notif.SenderId.ToString(), notif.RelatedId.ToString());

                return Ok(new { message = "Đã theo dõi thành công!" });
            }
        }

        [HttpGet("list/{userId}")]
        public async Task<IActionResult> GetFollowingList(Guid userId)
        {
            var following = await _context.Follows
                .Where(f => f.FollowerId == userId)
                .Join(_context.Users, f => f.FollowingId, u => u.Id, (f, u) => new { u.Id, u.Username, u.Email })
                .ToListAsync();

            return Ok(following);
        }
    }
}
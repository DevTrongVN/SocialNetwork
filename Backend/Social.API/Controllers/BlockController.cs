using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Social.Domain.Entities;
using Social.Infrastructure.Data;

namespace Social.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class BlockController : ControllerBase
    {
        private readonly SocialDbContext _context;

        public BlockController(SocialDbContext context)
        {
            _context = context;
        }

        // 1. LẤY DANH SÁCH ĐÃ CHẶN
        [HttpGet("list")]
        public async Task<IActionResult> GetBlockedUsers()
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));
            var blockedUsers = await _context.Blocks
                .Where(b => b.BlockerId == myId)
                .Join(_context.Users, b => b.BlockedId, u => u.Id, (b, u) => new
                {
                    id = u.Id,
                    username = u.Username,
                    email = u.Email,
                    createdAt = b.CreatedAt
                })
                .ToListAsync();
            return Ok(blockedUsers);
        }

        // 2. THỰC HIỆN CHẶN NGƯỜI DÙNG
        [HttpPost("{targetId}")]
        public async Task<IActionResult> BlockUser(Guid targetId, [FromBody] string? reason)
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));
            if (myId == targetId) return BadRequest("Không thể tự chặn mình!");

            // Kiểm tra xem đã chặn chưa
            if (await _context.Blocks.AnyAsync(b => b.BlockerId == myId && b.BlockedId == targetId))
                return BadRequest("Người dùng này đã bị chặn từ trước!");

            // 1. Thêm vào bảng Block
            _context.Blocks.Add(new Block { BlockerId = myId, BlockedId = targetId, Reason = reason });

            // 2. Xóa Friendship (Nếu có)
            var friend = await _context.Friendships.FirstOrDefaultAsync(f =>
                (f.RequesterId == myId && f.ReceiverId == targetId) || (f.RequesterId == targetId && f.ReceiverId == myId));
            if (friend != null) _context.Friendships.Remove(friend);

            // 3. Xóa Follow (Cả 2 chiều)
            var follows = await _context.Follows.Where(f =>
                (f.FollowerId == myId && f.FollowingId == targetId) || (f.FollowerId == targetId && f.FollowingId == myId)).ToListAsync();
            if (follows.Any()) _context.Follows.RemoveRange(follows);

            await _context.SaveChangesAsync();
            return Ok(new { message = "Đã chặn người dùng. Họ sẽ không thể tương tác với bạn nữa!" });
        }

        // 3. BỎ CHẶN
        [HttpDelete("unblock/{targetId}")]
        public async Task<IActionResult> UnblockUser(Guid targetId)
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));
            var block = await _context.Blocks.FirstOrDefaultAsync(b => b.BlockerId == myId && b.BlockedId == targetId);

            if (block == null) return BadRequest("Chưa chặn người này!");

            _context.Blocks.Remove(block);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Đã bỏ chặn thành công!" });
        }
    }
}
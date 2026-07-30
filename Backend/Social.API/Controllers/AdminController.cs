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
    public class AdminController : ControllerBase
    {
        private readonly SocialDbContext _context;

        public AdminController(SocialDbContext context)
        {
            _context = context;
        }

        // --- HÀM ẨN: TỰ BIẾN MÌNH THÀNH ADMIN (Dành cho Dev lúc test) ---
        [HttpPost("make-me-admin")]
        public async Task<IActionResult> MakeMeAdmin()
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));
            var user = await _context.Users.FindAsync(myId);

            if (user != null)
            {
                user.Role = "Admin";
                await _context.SaveChangesAsync();
                return Ok(new { message = "Bạn đã trở thành Quản trị viên tối cao!" });
            }
            return BadRequest("Lỗi hệ thống");
        }

        // --- HÀM KIỂM TRA QUYỀN ADMIN CHUẨN TRƯỚC KHI LÀM VIỆC ---
        private async Task<bool> IsAdmin()
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier));
            var user = await _context.Users.FindAsync(myId);
            return user != null && user.Role == "Admin";
        }

        // 1. LẤY DANH SÁCH BÁO CÁO (CHƯA XỬ LÝ)
        [HttpGet("reports")]
        public async Task<IActionResult> GetPendingReports()
        {
            if (!await IsAdmin()) return StatusCode(403, "Chỉ Admin mới có quyền truy cập!");

            var reports = await _context.Reports
                .Where(r => r.Status == "Pending")
                .Join(_context.Users, r => r.ReporterId, u => u.Id, (r, u) => new
                {
                    id = r.Id,
                    reporterName = u.Username,
                    targetType = r.TargetType,
                    targetId = r.TargetId,
                    reason = r.Reason,
                    createdAt = r.CreatedAt
                })
                .OrderByDescending(r => r.createdAt)
                .ToListAsync();

            return Ok(reports);
        }

        // 2. DUYỆT BÁO CÁO (Đã xem / Đã xử lý)
        [HttpPut("report/{reportId}/resolve")]
        public async Task<IActionResult> ResolveReport(Guid reportId)
        {
            if (!await IsAdmin()) return StatusCode(403, "Chỉ Admin mới có quyền!");

            var report = await _context.Reports.FindAsync(reportId);
            if (report == null) return NotFound("Không tìm thấy báo cáo!");

            report.Status = "Resolved";
            await _context.SaveChangesAsync();
            return Ok(new { message = "Đã đánh dấu báo cáo là Đã xử lý." });
        }

        // 3. ADMIN: XÓA BÀI VIẾT BẤT KỲ
        [HttpDelete("post/{postId}")]
        public async Task<IActionResult> DeletePost(Guid postId)
        {
            if (!await IsAdmin()) return StatusCode(403, "Chỉ Admin mới có quyền!");

            var post = await _context.Posts.FindAsync(postId);
            if (post == null) return NotFound("Bài viết không tồn tại!");

            post.IsDeleted = true; // Xóa mềm (Soft Delete)
            post.DeletedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return Ok(new { message = "Bài viết vi phạm đã bị gỡ bỏ khỏi hệ thống!" });
        }

        // 4. ADMIN: KHÓA TÀI KHOẢN (BAN USER)
        [HttpDelete("user/{userId}")]
        public async Task<IActionResult> BanUser(Guid userId)
        {
            if (!await IsAdmin()) return StatusCode(403, "Chỉ Admin mới có quyền!");

            var targetUser = await _context.Users.FindAsync(userId);
            if (targetUser == null) return NotFound("Người dùng không tồn tại!");
            if (targetUser.Role == "Admin") return BadRequest("Không thể khóa tài khoản của Admin khác!");

            targetUser.IsDeleted = true; // Tạm khóa (Khóa mềm)
            targetUser.DeletedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return Ok(new { message = $"Đã khóa tài khoản người dùng: {targetUser.Username}!" });
        }
    }
}
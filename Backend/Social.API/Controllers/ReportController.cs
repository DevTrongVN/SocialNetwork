using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Social.Domain.Entities;
using Social.Infrastructure.Data;

namespace Social.API.Controllers
{
    public class CreateReportRequest
    {
        public string TargetType { get; set; } = string.Empty; // "Post" hoặc "User"
        public Guid TargetId { get; set; }
        public string Reason { get; set; } = string.Empty;
    }

    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class ReportController : ControllerBase
    {
        private readonly SocialDbContext _context;

        public ReportController(SocialDbContext context)
        {
            _context = context;
        }

        [HttpPost]
        public async Task<IActionResult> SubmitReport([FromBody] CreateReportRequest request)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // Kiểm tra xem đã report cái này trước đó chưa (tránh spam report 1 bài liên tục)
            var existingReport = await _context.Reports.FirstOrDefaultAsync(r =>
                r.ReporterId == myId &&
                r.TargetType == request.TargetType &&
                r.TargetId == request.TargetId &&
                r.Status == "Pending");

            if (existingReport != null)
            {
                return BadRequest("Bạn đã gửi báo cáo cho nội dung này rồi. Hệ thống đang xem xét!");
            }

            var report = new Report
            {
                ReporterId = myId,
                TargetType = request.TargetType,
                TargetId = request.TargetId,
                Reason = request.Reason,
                CreatedAt = DateTime.UtcNow
            };

            _context.Reports.Add(report);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Cảm ơn bạn đã báo cáo. Chúng tôi sẽ xem xét nội dung này sớm nhất có thể!" });
        }
    }
}
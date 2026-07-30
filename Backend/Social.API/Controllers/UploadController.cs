using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Social.Application.DTOs;
namespace Social.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class UploadController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;

        public UploadController(IWebHostEnvironment env)
        {
            _env = env;
        }

        [HttpPost("image")] // Endpoint dùng chung cho cả Ảnh và Video
        [DisableRequestSizeLimit] // BẢO KÊ ĐẦU VÀO 5GB
        [RequestFormLimits(ValueLengthLimit = int.MaxValue, MultipartBodyLengthLimit = long.MaxValue)] // BẢO KÊ ĐỌC FILE 5GB
        public async Task<IActionResult> UploadMedia(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("Bạn chưa chọn file nào!");

            // Cho phép cả Định dạng Ảnh và Video
            var extension = Path.GetExtension(file.FileName).ToLower();
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".mp4", ".webm", ".mov" };

            if (!allowedExtensions.Contains(extension))
                return BadRequest("Chỉ chấp nhận file ảnh (.jpg, .png, .gif) và video (.mp4, .webm, .mov)!");

            if (file.Length > 5368709120) // Giới hạn 5GB
                return BadRequest("Kích thước file vượt quá giới hạn 5GB.");

            var uploadsFolder = Path.Combine(_env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"), "uploads");
            if (!Directory.Exists(uploadsFolder))
                Directory.CreateDirectory(uploadsFolder);

            var uniqueFileName = Guid.NewGuid().ToString() + extension;
            var filePath = Path.Combine(uploadsFolder, uniqueFileName);

            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            var fileUrl = $"/uploads/{uniqueFileName}";
            return Ok(new { url = fileUrl });
        }
        // --- API ĐẶC BIỆT DÀNH CHO CHAT E2EE ---
        [HttpPost("chat-e2ee")]
        [DisableRequestSizeLimit] // BẢO KÊ ĐẦU VÀO
        [RequestFormLimits(ValueLengthLimit = int.MaxValue, MultipartBodyLengthLimit = long.MaxValue)]
        public async Task<IActionResult> UploadE2EEMedia([FromBody] E2EEUploadRequest request)
        {
            if (string.IsNullOrEmpty(request.EncryptedContent)) return BadRequest("Không có dữ liệu");

            // Tạo thư mục nếu chưa có
            var uploadsFolder = Path.Combine(_env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"), "uploads", "chat_e2ee");
            if (!Directory.Exists(uploadsFolder)) Directory.CreateDirectory(uploadsFolder);

            // Lưu cục text mã hóa thành file .txt (Bảo mật tuyệt đối, mở server ra cũng chỉ thấy ký tự lạ)
            string fileName = Guid.NewGuid().ToString() + ".txt";
            string filePath = Path.Combine(uploadsFolder, fileName);

            await System.IO.File.WriteAllTextAsync(filePath, request.EncryptedContent);

            return Ok(new { fileUrl = $"/uploads/chat_e2ee/{fileName}" });
        }

    }
}
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Social.Application.DTOs;
using Social.Domain.Entities;
using Social.Infrastructure.Data;
using Social.API.Services;

namespace Social.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly SocialDbContext _context;
        private readonly IConfiguration _configuration;
        private readonly EmailService _emailService;

        public AuthController(SocialDbContext context, IConfiguration configuration, EmailService emailService)
        {
            _context = context;
            _configuration = configuration;
            _emailService = emailService;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            var existingUser = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email);

            string otpCode = new Random().Next(100000, 999999).ToString();
            DateTime otpExpiry = DateTime.UtcNow.AddMinutes(5);

            User user;
            if (existingUser != null)
            {
                if (existingUser.IsEmailVerified)
                    return BadRequest("Email này đã được sử dụng và xác thực!");

                existingUser.OtpCode = otpCode;
                existingUser.OtpExpiry = otpExpiry;
                existingUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
                existingUser.Username = request.Username;
                user = existingUser;
            }
            else
            {
                string passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
                user = new User
                {
                    Username = request.Username,
                    Email = request.Email,
                    PasswordHash = passwordHash,
                    IsEmailVerified = false,
                    OtpCode = otpCode,
                    OtpExpiry = otpExpiry
                };
                _context.Users.Add(user);
            }

            await _context.SaveChangesAsync();

            // THỬ GỬI EMAIL - NẾU THẤT BẠI THÌ ROLLBACK TÀI KHOẢN VỪA TẠO
            try
            {
                await _emailService.SendOtpEmailAsync(request.Email, "Dev Trọng - Mã Xác Thực Đăng Ký", otpCode);
                return Ok(new { message = "Vui lòng kiểm tra Email để lấy mã OTP xác thực!", requiresOtp = true });
            }
            catch (Exception ex)
            {
                // Nếu gửi mail xịt -> Xóa user khỏi DB để người dùng không bị kẹt acc
                if (existingUser == null)
                {
                    _context.Users.Remove(user);
                    await _context.SaveChangesAsync();
                }
                return BadRequest($"Lỗi gửi Email: {ex.Message}. Vui lòng kiểm tra Mật khẩu Ứng dụng Gmail.");
            }
        }

        [HttpPost("verify-otp")]
        public async Task<IActionResult> VerifyOtp([FromBody] VerifyOtpRequest request)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
            if (user == null) return BadRequest("Email không tồn tại!");

            if (user.OtpCode != request.OtpCode) return BadRequest("Mã OTP không chính xác!");
            if (user.OtpExpiry < DateTime.UtcNow) return BadRequest("Mã OTP đã hết hạn!");

            user.IsEmailVerified = true;
            user.OtpCode = null;
            user.OtpExpiry = null;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Xác thực tài khoản thành công! Bạn có thể đăng nhập." });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
            if (user == null) return BadRequest("Email không tồn tại!");

            // Kiểm tra mật khẩu trước
            if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
                return BadRequest("Sai mật khẩu!");

            // NẾU CHƯA XÁC THỰC -> TỰ ĐỘNG CẤP LẠI OTP VÀ ĐẨY SANG MÀN HÌNH NHẬP OTP
            if (!user.IsEmailVerified)
            {
                string newOtp = new Random().Next(100000, 999999).ToString();
                user.OtpCode = newOtp;
                user.OtpExpiry = DateTime.UtcNow.AddMinutes(5);
                await _context.SaveChangesAsync();

                try
                {
                    await _emailService.SendOtpEmailAsync(user.Email, "Dev Trọng - Mã Xác Thực (Gửi Lại)", newOtp);
                }
                catch { } // Bỏ qua lỗi gửi mail để không làm sập tiến trình

                return Ok(new
                {
                    message = "Tài khoản chưa xác thực. Hệ thống đã gửi mã OTP mới vào Email của bạn!",
                    requiresOtp = true
                });
            }

            // Nếu đã xác thực thì cấp Token như bình thường
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_configuration["Jwt:Key"]!);
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[] {
                    new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                    new Claim(ClaimTypes.Name, user.Username)
                }),
                Expires = DateTime.UtcNow.AddDays(7),
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };

            var token = tokenHandler.CreateToken(tokenDescriptor);
            return Ok(new { message = "Đăng nhập thành công!", token = tokenHandler.WriteToken(token) });
        }

        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
            if (user == null) return BadRequest("Email này chưa được đăng ký trong hệ thống!");

            string otpCode = new Random().Next(100000, 999999).ToString();
            user.OtpCode = otpCode;
            user.OtpExpiry = DateTime.UtcNow.AddMinutes(5);
            await _context.SaveChangesAsync();

            try
            {
                await _emailService.SendOtpEmailAsync(request.Email, "Dev Trọng - Khôi phục mật khẩu", otpCode);
                return Ok(new { message = "Mã OTP khôi phục mật khẩu đã được gửi đến Email của bạn." });
            }
            catch (Exception ex)
            {
                return BadRequest($"Lỗi khi gửi Email OTP: {ex.Message}");
            }
        }

        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
            if (user == null) return BadRequest("Lỗi xác thực!");

            if (user.OtpCode != request.OtpCode) return BadRequest("Mã OTP không chính xác!");
            if (user.OtpExpiry < DateTime.UtcNow) return BadRequest("Mã OTP đã hết hạn!");

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            user.OtpCode = null;
            user.OtpExpiry = null;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Đổi mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới." });
        }
    }

    public class VerifyOtpRequest
    {
        public string Email { get; set; } = string.Empty;
        public string OtpCode { get; set; } = string.Empty;
    }

    public class ForgotPasswordRequest
    {
        public string Email { get; set; } = string.Empty;
    }

    public class ResetPasswordRequest
    {
        public string Email { get; set; } = string.Empty;
        public string OtpCode { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }
}
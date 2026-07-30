using MailKit.Net.Smtp;
using MimeKit;
using Microsoft.Extensions.Configuration;

namespace Social.API.Services
{
    public class EmailService
    {
        private readonly string _emailFrom;
        private readonly string _appPassword;

        public EmailService(IConfiguration configuration)
        {
            _emailFrom = configuration["EmailSettings:EmailFrom"] ?? "";
            _appPassword = configuration["EmailSettings:AppPassword"] ?? "";
        }

        public async Task SendOtpEmailAsync(string toEmail, string subject, string otpCode)
        {
            var email = new MimeMessage();
            email.From.Add(new MailboxAddress("Dev Trọng", _emailFrom));
            email.To.Add(MailboxAddress.Parse(toEmail));
            email.Subject = subject;

            var builder = new BodyBuilder
            {
                HtmlBody = $@"
                <div style='font-family: Arial, sans-serif; padding: 20px; text-align: center; background-color: #f0f2f5; border-radius: 10px;'>
                    <h2 style='color: #1877f2;'>Dev Trọng - Trạm Không Gian Dev Trọng</h2>
                    <p style='font-size: 16px; color: #555;'>Mã xác thực (OTP) của bạn là:</p>
                    <div style='font-size: 32px; font-weight: bold; color: #ff0000; letter-spacing: 5px; margin: 20px 0;'>{otpCode}</div>
                    <p style='font-size: 14px; color: #888;'>Mã này có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
                </div>"
            };
            email.Body = builder.ToMessageBody();

            using var smtp = new SmtpClient();

            // BỎ QUA LỖI CHỨNG CHỈ SSL LOCALHOST (Tránh bị ngắt kết nối trên Windows/Antivirus)
            smtp.ServerCertificateValidationCallback = (s, c, h, e) => true;

            try
            {
                await smtp.ConnectAsync("smtp.gmail.com", 587, MailKit.Security.SecureSocketOptions.StartTls);
                await smtp.AuthenticateAsync(_emailFrom, _appPassword);
                await smtp.SendAsync(email);
            }
            catch
            {
                // Nếu cổng 587 bị chặn, thử tự động chuyển sang cổng 465 (SSL Direct)
                if (smtp.IsConnected) await smtp.DisconnectAsync(true);
                await smtp.ConnectAsync("smtp.gmail.com", 465, MailKit.Security.SecureSocketOptions.SslOnConnect);
                await smtp.AuthenticateAsync(_emailFrom, _appPassword);
                await smtp.SendAsync(email);
            }
            finally
            {
                if (smtp.IsConnected) await smtp.DisconnectAsync(true);
            }
        }
    }
}
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Social.API.Hubs;
using Social.API.Services;
using Social.Infrastructure.Data;
using System.Text;

var builder = WebApplication.CreateBuilder(args);
// --- CẤU HÌNH MỞ KHÓA SIÊU UPLOAD 5GB ---
long maxFileSize = 5368709120; // 5GB = 5 * 1024 * 1024 * 1024 bytes

builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = maxFileSize;
    options.ValueLengthLimit = int.MaxValue;
    options.MultipartHeadersLengthLimit = int.MaxValue;
});

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = maxFileSize;
    // Tăng thời gian cho phép Server đứng đợi upload lên 2 tiếng (tránh bị ngắt giữa chừng)
    options.Limits.KeepAliveTimeout = TimeSpan.FromMinutes(120);
    options.Limits.RequestHeadersTimeout = TimeSpan.FromMinutes(120);
});
// ----------------------------------------
// Add services to the container.
builder.Services.AddOpenApi();
builder.Services.AddControllers();
// --- CẤU HÌNH CORS (Cho phép trình duyệt Web gọi API) ---
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .SetIsOriginAllowed((host) => true) // Mở cửa cho mọi URL test
              .AllowCredentials(); // Bắt buộc phải có dòng này SignalR mới chạy
    });
});
builder.Services.AddSignalR();

// --- CẤU HÌNH DATABASE ---
builder.Services.AddDbContext<SocialDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// --- CẤU HÌNH HỆ THỐNG AN NINH JWT ---
// --- CẤU HÌNH HỆ THỐNG AN NINH JWT ---
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)),
        ValidateIssuer = false,
        ValidateAudience = false
    };

    // --- THÊM ĐOẠN NÀY ĐỂ BẮT TOKEN TỪ SIGNALR (WEBSOCKET) ---
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;

            // Nếu có token trong URL và đang gọi vào cổng chathub
            if (!string.IsNullOrEmpty(accessToken) && (path.StartsWithSegments("/chathub")))
            {
                context.Token = accessToken; // Báo cho C# biết thẻ JWT nằm ở đây
            }
            return Task.CompletedTask;
        }
    };
});
builder.Services.AddScoped<EmailService>(); // Thêm vào phần chứa builder.Services
var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

//app.UseHttpsRedirection();
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors("AllowAll"); // Kích hoạt CORS

// --- KÍCH HOẠT BẢO VỆ (Bắt buộc phải nằm ngay trên MapControllers) ---
app.UseAuthentication(); // Bật máy quét thẻ
app.UseAuthorization();  // Kiểm tra quyền hạn

app.MapControllers();
app.MapGet("/ping", () => "PONG! TUNNEL CUA TRONG DANG HOAT DONG QUÁ NGON!");
app.MapHub<ChatHub>("/chathub");
app.Run();


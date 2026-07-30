using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Social.Domain.Entities;
using Social.Infrastructure.Data;

namespace Social.API.Controllers
{
    // DTO để nhận dữ liệu từ Frontend gửi lên
    public class CreateStoryRequest
    {
        public string ImageUrl { get; set; } = string.Empty;
    }

    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class StoryController : ControllerBase
    {
        private readonly SocialDbContext _context;

        public StoryController(SocialDbContext context)
        {
            _context = context;
        }

        // 1. API: ĐĂNG STORY MỚI (Tự động canh giờ hủy sau 24 tiếng)
        [HttpPost]
        public async Task<IActionResult> CreateStory([FromBody] CreateStoryRequest request)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            if (string.IsNullOrWhiteSpace(request.ImageUrl))
                return BadRequest("Ảnh không được để trống!");

            var story = new Story
            {
                UserId = myId,
                ImageUrl = request.ImageUrl,
                CreatedAt = DateTime.UtcNow,
                ExpiresAt = DateTime.UtcNow.AddHours(24) // Bí quyết của Story 24h nằm ở đây!
            };

            _context.Stories.Add(story);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Đã thêm vào Tin của bạn!", story });
        }

        // 2. API: LẤY DANH SÁCH BẢNG TIN STORY (Đang còn hạn 24h)
        [HttpGet("feed")]
        public async Task<IActionResult> GetStoryFeed()
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // 2.1. Lấy danh sách ID bạn bè
            var friendIds = await _context.Friendships
                .Where(f => f.Status == 1 && (f.RequesterId == myId || f.ReceiverId == myId))
                .Select(f => f.RequesterId == myId ? f.ReceiverId : f.RequesterId)
                .ToListAsync();

            // Thêm chính mình vào danh sách để lấy luôn Story của mình
            var visibleIds = friendIds.Concat(new[] { myId }).ToList();

            var now = DateTime.UtcNow;

            // 2.2. Lấy TẤT CẢ Story CHƯA HẾT HẠN của những người này
            var activeStories = await _context.Stories
                .Where(s => visibleIds.Contains(s.UserId) && s.ExpiresAt > now)
                .OrderBy(s => s.CreatedAt)
                .ToListAsync();

            if (!activeStories.Any()) return Ok(new List<object>()); // Trống trơn

            var activeStoryIds = activeStories.Select(s => s.Id).ToList();

            // 2.3. Kiểm tra xem MÌNH ĐÃ XEM những Story nào rồi
            var myViews = await _context.StoryViews
                .Where(v => activeStoryIds.Contains(v.StoryId) && v.ViewerId == myId)
                .Select(v => v.StoryId)
                .ToListAsync();

            // 2.4. Gom nhóm Story theo Từng Người Dùng (Để vẽ ra các thẻ vòng tròn)
            var userIdsWithStories = activeStories.Select(s => s.UserId).Distinct().ToList();
            var users = await _context.Users.Where(u => userIdsWithStories.Contains(u.Id)).ToListAsync();

            var result = new List<object>();

            foreach (var user in users)
            {
                // Lấy ra tất cả Story của người này
                var userStories = activeStories.Where(s => s.UserId == user.Id).ToList();

                // Nếu mình ĐÃ XEM TẤT CẢ Story của người này -> Đánh dấu là isSeen = true
                bool isAllSeen = userStories.All(s => myViews.Contains(s.Id));

                result.Add(new
                {
                    userId = user.Id,
                    name = user.Username,
                    avatar = user.AvatarUrl,
                    // Lấy ảnh của Story mới nhất làm ảnh bìa cho thẻ
                    img = userStories.Last().ImageUrl,
                    isSeen = isAllSeen,
                    // Đính kèm luôn mảng Story chi tiết bên trong để lúc bấm vào sẽ trượt xem
                    stories = userStories.Select(s => new
                    {
                        id = s.Id,
                        imageUrl = s.ImageUrl,
                        createdAt = s.CreatedAt,
                        isSeen = myViews.Contains(s.Id)
                    })
                });
            }

            // 2.5. Thuật toán Sắp xếp: Ai CHƯA XEM thì đẩy lên ưu tiên đầu, ai XEM RỒI thì tống xuống cuối danh sách
            var sortedResult = result.OrderBy(r => (bool)((dynamic)r).isSeen ? 1 : 0).ToList();

            return Ok(sortedResult);
        }

        // 3. API: ĐÁNH DẤU "ĐÃ XEM" KHI BẤM VÀO STORY MỞ LÊN
        [HttpPost("{storyId}/view")]
        public async Task<IActionResult> ViewStory(Guid storyId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // Kiểm tra xem đã lưu lượt xem này chưa (tránh 1 người xem đi xem lại bị tính nhiều view)
            var existingView = await _context.StoryViews
                .FirstOrDefaultAsync(v => v.StoryId == storyId && v.ViewerId == myId);

            if (existingView == null)
            {
                _context.StoryViews.Add(new StoryView
                {
                    StoryId = storyId,
                    ViewerId = myId,
                    ViewedAt = DateTime.UtcNow
                });
                await _context.SaveChangesAsync();
            }

            return Ok();
        }
        // 4. API: TỰ XÓA STORY CỦA MÌNH
        [HttpDelete("{storyId}")]
        public async Task<IActionResult> DeleteStory(Guid storyId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var story = await _context.Stories.FindAsync(storyId);
            if (story == null) return NotFound("Story không tồn tại!");

            if (story.UserId != myId) return StatusCode(403, "Bạn không có quyền xóa Story của người khác!");

            _context.Stories.Remove(story);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Đã xóa Story thành công!" });
        }
    }
}
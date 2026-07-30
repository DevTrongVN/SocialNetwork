using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Social.Domain.Entities;
using Social.Infrastructure.Data;
using System.Security.Claims;

namespace Social.API.Controllers
{
    public class CreateGroupRequest
    {
        public string Name { get; set; } = string.Empty;
    }

    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class GroupController : ControllerBase
    {
        private readonly SocialDbContext _context;

        public GroupController(SocialDbContext context)
        {
            _context = context;
        }

        [HttpPost("create")]
        public async Task<IActionResult> CreateGroup([FromBody] CreateGroupRequest request)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            if (string.IsNullOrWhiteSpace(request.Name)) return BadRequest("Tên nhóm không được để trống!");

            // 1. Tạo Nhóm Chat mới
            var newGroup = new ChatGroup
            {
                Name = request.Name,
                CreatedBy = myId
            };
            _context.ChatGroups.Add(newGroup);

            // 2. Thêm chính người tạo vào nhóm với quyền Trưởng Nhóm (Role = 2)
            var adminMember = new GroupMember
            {
                GroupId = newGroup.Id,
                UserId = myId,
                Role = 2
            };
            _context.GroupMembers.Add(adminMember);

            await _context.SaveChangesAsync();

            return Ok(new { message = "Tạo nhóm thành công!", groupId = newGroup.Id, groupName = newGroup.Name });
        }

        [HttpGet("my-groups")]
        public async Task<IActionResult> GetMyGroups()
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // Tìm những nhóm mà mình là thành viên
            var myGroupIds = await _context.GroupMembers
                .Where(gm => gm.UserId == myId)
                .Select(gm => gm.GroupId)
                .ToListAsync();

            var groups = await _context.ChatGroups
                .Where(g => myGroupIds.Contains(g.Id))
                .OrderByDescending(g => g.CreatedAt)
                .Select(g => new {
                    id = g.Id,
                    name = g.Name,
                    avatarUrl = g.AvatarUrl,
                    isGroup = true // Cờ nhận diện để Frontend biết đây là Group, không phải User
                })
                .ToListAsync();

            return Ok(groups);
        }

        [HttpPost("{groupId}/add-member")]
        public async Task<IActionResult> AddMember(Guid groupId, [FromBody] string email)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var myRole = await _context.GroupMembers.Where(gm => gm.GroupId == groupId && gm.UserId == myId).Select(gm => gm.Role).FirstOrDefaultAsync();
            if (myRole < 1) return StatusCode(403, new { message = "Chỉ Trưởng/Phó nhóm mới có quyền thêm người!" });

            var targetUser = await _context.Users.FirstOrDefaultAsync(u => u.Email == email.Trim() && !u.IsDeleted);
            if (targetUser == null) return NotFound(new { message = "Không tìm thấy người dùng!" });

            // KIỂM TRA BẠN BÈ
            bool isFriend = await _context.Friendships.AnyAsync(f => f.Status == 1 && ((f.RequesterId == myId && f.ReceiverId == targetUser.Id) || (f.RequesterId == targetUser.Id && f.ReceiverId == myId)));
            if (!isFriend) return BadRequest(new { message = "Chỉ có thể thêm người đã là bạn bè vào nhóm!" });

            if (await _context.GroupMembers.AnyAsync(gm => gm.GroupId == groupId && gm.UserId == targetUser.Id))
                return BadRequest(new { message = "Người này đã ở trong nhóm!" });

            _context.GroupMembers.Add(new GroupMember { GroupId = groupId, UserId = targetUser.Id, Role = 0 });
            await _context.SaveChangesAsync();

            return Ok(new { message = $"Đã thêm {targetUser.Username} vào nhóm!", targetId = targetUser.Id, targetName = targetUser.Username });
        }

        [HttpGet("{groupId}/members")]
        public async Task<IActionResult> GetGroupMembers(Guid groupId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            // Lấy danh sách thành viên (join bảng GroupMembers với bảng Users)
            var members = await _context.GroupMembers
                .Where(gm => gm.GroupId == groupId)
                .Join(_context.Users, gm => gm.UserId, u => u.Id, (gm, u) => new {
                    id = u.Id,
                    username = u.Username,
                    avatarUrl = u.AvatarUrl,
                    isMuted = gm.IsMuted,
                    role = gm.Role // 2: Trưởng nhóm, 1: Phó nhóm, 0: Thành viên
                })
                .OrderByDescending(m => m.role) // Đưa trưởng nhóm lên đầu
                .ToListAsync();

            return Ok(members);
        }

        // 2. KÍCH THÀNH VIÊN
        [HttpDelete("{groupId}/kick/{userId}")]
        public async Task<IActionResult> KickMember(Guid groupId, Guid userId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var myRole = await _context.GroupMembers.Where(gm => gm.GroupId == groupId && gm.UserId == myId).Select(gm => gm.Role).FirstOrDefaultAsync();
            var target = await _context.GroupMembers.FirstOrDefaultAsync(gm => gm.GroupId == groupId && gm.UserId == userId);

            if (target == null) return NotFound();
            if (myRole < 1 || myId == userId || myRole <= target.Role) return StatusCode(403, new { message = "Không đủ thẩm quyền!" });

            _context.GroupMembers.Remove(target);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Đã kích thành viên!" });
        }

        // 3. THĂNG / GIÁNG CHỨC (CHỈ TRƯỞNG NHÓM)
        [HttpPut("{groupId}/role/{userId}")]
        public async Task<IActionResult> ChangeRole(Guid groupId, Guid userId, [FromQuery] int newRole)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var myRole = await _context.GroupMembers.Where(gm => gm.GroupId == groupId && gm.UserId == myId).Select(gm => gm.Role).FirstOrDefaultAsync();
            if (myRole != 2) return StatusCode(403, new { message = "Chỉ Trưởng nhóm mới có quyền thăng/giáng chức!" });

            var target = await _context.GroupMembers.FirstOrDefaultAsync(gm => gm.GroupId == groupId && gm.UserId == userId);
            if (target != null)
            {
                target.Role = newRole; // 0 = Thành viên, 1 = Phó nhóm
                await _context.SaveChangesAsync();
                return Ok(new { message = "Cập nhật chức vụ thành công!" });
            }
            return NotFound();
        }

        // 4. CẤM CHAT / MỞ CHAT
        [HttpPut("{groupId}/mute/{userId}")]
        public async Task<IActionResult> ToggleMute(Guid groupId, Guid userId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var myRole = await _context.GroupMembers.Where(gm => gm.GroupId == groupId && gm.UserId == myId).Select(gm => gm.Role).FirstOrDefaultAsync();
            var target = await _context.GroupMembers.FirstOrDefaultAsync(gm => gm.GroupId == groupId && gm.UserId == userId);

            if (target == null) return NotFound();
            if (myRole < 1 || myRole <= target.Role) return StatusCode(403, new { message = "Không đủ thẩm quyền cấm chat người này!" });

            target.IsMuted = !target.IsMuted;
            await _context.SaveChangesAsync();
            return Ok(new { message = target.IsMuted ? "Đã cấm chat!" : "Đã mở chat!" });
        }

        // 5. RỜI NHÓM & GIẢI TÁN
        [HttpDelete("{groupId}/leave")]
        public async Task<IActionResult> LeaveGroup(Guid groupId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var myInfo = await _context.GroupMembers.FirstOrDefaultAsync(gm => gm.GroupId == groupId && gm.UserId == myId);
            if (myInfo == null) return NotFound();

            var otherMembers = await _context.GroupMembers.CountAsync(gm => gm.GroupId == groupId && gm.UserId != myId);

            if (myInfo.Role == 2 && otherMembers > 0)
                return BadRequest(new { message = "Bạn là Trưởng nhóm. Vui lòng chuyển quyền Trưởng nhóm cho người khác trước khi rời đi, hoặc chọn Giải tán nhóm!" });

            _context.GroupMembers.Remove(myInfo);

            if (otherMembers == 0) // Nhóm không còn ai thì xóa luôn nhóm
            {
                var group = await _context.ChatGroups.FindAsync(groupId);
                if (group != null) _context.ChatGroups.Remove(group);
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Đã rời nhóm!" });
        }
        // 6. NHƯỜNG QUYỀN TRƯỞNG NHÓM (Chuyển ngôi)
        [HttpPut("{groupId}/transfer/{userId}")]
        public async Task<IActionResult> TransferOwnership(Guid groupId, Guid userId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var myInfo = await _context.GroupMembers.FirstOrDefaultAsync(gm => gm.GroupId == groupId && gm.UserId == myId);
            if (myInfo == null || myInfo.Role != 2) return StatusCode(403, new { message = "Chỉ Trưởng nhóm mới có quyền nhường ngôi!" });

            var targetMember = await _context.GroupMembers.FirstOrDefaultAsync(gm => gm.GroupId == groupId && gm.UserId == userId);
            if (targetMember == null) return NotFound(new { message = "Không tìm thấy người này trong nhóm!" });

            myInfo.Role = 1; // Mình tự giáng xuống làm Phó nhóm
            targetMember.Role = 2; // Đội vương miện cho người mới

            await _context.SaveChangesAsync();
            return Ok(new { message = "Chuyển quyền Trưởng nhóm thành công!" });
        }

        // 7. GIẢI TÁN NHÓM (Xóa sổ hoàn toàn)
        [HttpDelete("{groupId}/disband")]
        public async Task<IActionResult> DisbandGroup(Guid groupId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();

            var myInfo = await _context.GroupMembers.FirstOrDefaultAsync(gm => gm.GroupId == groupId && gm.UserId == myId);
            if (myInfo == null || myInfo.Role != 2) return StatusCode(403, new { message = "Chỉ Trưởng nhóm mới có quyền giải tán!" });

            // Xóa sạch Thành viên
            var members = await _context.GroupMembers.Where(gm => gm.GroupId == groupId).ToListAsync();
            _context.GroupMembers.RemoveRange(members);

            // Xóa sạch Tin nhắn của nhóm đó
            var msgs = await _context.Messages.Where(m => m.GroupId == groupId).ToListAsync();
            _context.Messages.RemoveRange(msgs);

            // Xóa Nhóm
            var group = await _context.ChatGroups.FindAsync(groupId);
            if (group != null) _context.ChatGroups.Remove(group);

            await _context.SaveChangesAsync();
            return Ok(new { message = "Đã giải tán nhóm thành công!" });
        }
    }
}
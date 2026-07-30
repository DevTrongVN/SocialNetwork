using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class GroupMember
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        
        public Guid GroupId { get; set; }
        public Guid UserId { get; set; }
        
        // Phân quyền: 0 = Thành viên, 1 = Phó nhóm, 2 = Trưởng nhóm
        public int Role { get; set; } = 0; 
        
        // Tính năng Tắt thông báo (Giai đoạn 3)
        public bool IsMuted { get; set; } = false; 
        
        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    }
}
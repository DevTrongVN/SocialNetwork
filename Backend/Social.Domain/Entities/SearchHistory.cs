using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class SearchHistory
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        
        public Guid UserId { get; set; } // Người thực hiện tìm kiếm
        
        public string? Keyword { get; set; } // Nếu họ gõ từ khóa để tìm
        
        public Guid? TargetUserId { get; set; } // Nếu họ bấm trực tiếp vào trang cá nhân của 1 ai đó từ kết quả tìm kiếm
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
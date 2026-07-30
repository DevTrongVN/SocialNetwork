using System;
using System.Collections.Generic;
using System.Text;
namespace Social.Domain.Entities
{
    public class Comment
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        // Bình luận này thuộc về Bài viết nào?
        public Guid PostId { get; set; }

        // Ai là người bình luận?
        public Guid UserId { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public Guid? ParentCommentId { get; set; }
        public string AuthorName { get; set; } = string.Empty;

        // Nội dung chửi... à nhầm, nội dung bình luận
        public string Content { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}

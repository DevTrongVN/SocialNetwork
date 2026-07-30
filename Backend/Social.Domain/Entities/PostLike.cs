using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class PostLike
    {
        // ID của bài viết được thích
        public Guid PostId { get; set; }

        // ID của người bấm thích
        public Guid UserId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string ReactionType { get; set; } = "Like";
    }
}

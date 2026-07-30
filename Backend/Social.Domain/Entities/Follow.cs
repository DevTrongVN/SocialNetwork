using System;
using System.Collections.Generic;
using System.Text;

namespace Social.Domain.Entities
{
    public class Follow
    {
        // ID của người ĐI theo dõi (Follower)
        public Guid FollowerId { get; set; }

        // ID của người ĐƯỢC theo dõi (Following)
        public Guid FollowingId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
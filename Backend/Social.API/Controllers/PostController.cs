using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Social.API.Hubs;
using Social.Application.DTOs;
using Social.Domain.Entities;
using Social.Infrastructure.Data;

namespace Social.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class PostController : ControllerBase
    {
        private readonly SocialDbContext _context;
        private readonly IHubContext<ChatHub> _hubContext;

        public PostController(SocialDbContext context, IHubContext<ChatHub> hubContext)
        {
            _context = context;
            _hubContext = hubContext;
        }

        // HÀM XỬ LÝ TAG TÊN (Đã gắn SignalR chuẩn)
        private async Task NotifyMentions(string content, Guid senderId, string senderName, Guid relatedId, string typeTarget)
        {
            if (string.IsNullOrEmpty(content)) return;
            var regex = new Regex(@"@\[(.*?)\]\((.*?)\)");
            var matches = regex.Matches(content);
            var notifiedIds = new HashSet<Guid>();

            foreach (Match match in matches)
            {
                if (Guid.TryParse(match.Groups[2].Value, out Guid taggedUserId) && taggedUserId != senderId)
                {
                    if (!notifiedIds.Contains(taggedUserId))
                    {
                        notifiedIds.Add(taggedUserId);
                        var typeStr = typeTarget == "Post" ? "bài viết" : "bình luận";
                        var notif = new Notification { UserId = taggedUserId, SenderId = senderId, Type = "Tag", RelatedId = relatedId, Content = $"{senderName} đã nhắc đến bạn trong một {typeStr}." };
                        _context.Notifications.Add(notif);

                        // SignalR bóp cò cho Tag
                        await _hubContext.Clients.User(taggedUserId.ToString()).SendAsync("ReceiveNotification", notif.Content, notif.Type, notif.SenderId.ToString(), notif.RelatedId.ToString());
                    }
                }
            }
        }

        [HttpPost]
        public async Task<IActionResult> CreatePost([FromBody] CreatePostRequest request)
        {
            var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var username = User.FindFirstValue(ClaimTypes.Name);
            if (!Guid.TryParse(userIdString, out Guid userId)) return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            int defaultPrivacy = user != null ? user.PostDefaultVisibility : 0;

            int privacyToSet = request.Privacy.HasValue ? request.Privacy.Value : defaultPrivacy;
            var post = new Post { UserId = userId, AuthorName = username ?? "Người dùng", Content = request.Content, ImageUrl = request.ImageUrl, CreatedAt = DateTime.UtcNow, LikeCount = 0, Privacy = privacyToSet };
            
            _context.Posts.Add(post);
            await _context.SaveChangesAsync();

            await NotifyMentions(post.Content, userId, post.AuthorName, post.Id, "Post");
            await _context.SaveChangesAsync();

            return Ok(new { message = "Đăng bài thành công!", post });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> EditPost(Guid id, [FromBody] EditPostRequest request)
        {
            var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdString, out Guid userId)) return Unauthorized();

            var post = await _context.Posts.FindAsync(id);
            if (post == null || post.IsDeleted) return NotFound("Bài viết không tồn tại!");
            if (post.UserId != userId) return StatusCode(403, "Bạn không có quyền sửa bài viết này!");

            post.Content = request.Content;
            post.Privacy = request.Privacy;

            _context.Posts.Update(post);
            await _context.SaveChangesAsync();

            await NotifyMentions(post.Content, userId, post.AuthorName, post.Id, "Post");

            return Ok(new { message = "Đã cập nhật bài viết thành công!", content = post.Content, privacy = post.Privacy });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeletePost(Guid id)
        {
            var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdString, out Guid userId)) return Unauthorized();

            var post = await _context.Posts.FindAsync(id);
            if (post == null || post.IsDeleted) return NotFound("Bài viết không tồn tại!");
            if (post.UserId != userId) return StatusCode(403, "Bạn không có quyền xóa bài viết này!");

            post.IsDeleted = true;
            _context.Posts.Update(post);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Đã xóa bài viết thành công!" });
        }

        [HttpPost("{id}/comment")]
        public async Task<IActionResult> AddComment(Guid id, [FromBody] CreateCommentRequest request)
        {
            var post = await _context.Posts.FindAsync(id);
            if (post == null) return NotFound("Bài viết không tồn tại!");

            var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var username = User.FindFirstValue(ClaimTypes.Name);
            if (!Guid.TryParse(userIdString, out Guid userId)) return Unauthorized();

            var comment = new Comment { PostId = id, UserId = userId, AuthorName = username ?? "Ẩn danh", Content = request.Content, CreatedAt = DateTime.UtcNow, ParentCommentId = request.ParentCommentId };
            _context.Comments.Add(comment);

            // XỬ LÝ THÔNG BÁO CHO COMMENT/REPLY
            if (request.ParentCommentId.HasValue)
            {
                // 1. Nếu là Trả lời (Reply) -> Báo cho người viết bình luận gốc
                var parentComment = await _context.Comments.FindAsync(request.ParentCommentId.Value);
                if (parentComment != null && parentComment.UserId != userId)
                {
                    var replyNotif = new Notification { UserId = parentComment.UserId, SenderId = userId, Type = "Reply", RelatedId = post.Id, Content = $"{username} đã trả lời bình luận của bạn." };
                    _context.Notifications.Add(replyNotif);
                    await _hubContext.Clients.User(parentComment.UserId.ToString()).SendAsync("ReceiveNotification", replyNotif.Content, replyNotif.Type, replyNotif.SenderId.ToString(), replyNotif.RelatedId.ToString());
                }
            }
            else if (userId != post.UserId)
            {
                // 2. Nếu là Bình luận trực tiếp -> Báo cho chủ bài viết
                var notif = new Notification { UserId = post.UserId, SenderId = userId, Type = "Comment", RelatedId = post.Id, Content = $"{username} đã bình luận về bài viết của bạn." };
                _context.Notifications.Add(notif);
                await _hubContext.Clients.User(post.UserId.ToString()).SendAsync("ReceiveNotification", notif.Content, notif.Type, notif.SenderId.ToString(), notif.RelatedId.ToString());
            }

            await NotifyMentions(comment.Content, userId, comment.AuthorName, post.Id, "Comment");
            await _context.SaveChangesAsync();

            return Ok(new { message = "Bình luận thành công!", comment });
        }

        [HttpPost("{id}/untag")]
        public async Task<IActionResult> UntagPost(Guid id)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var myName = User.FindFirstValue(ClaimTypes.Name);
            var post = await _context.Posts.FindAsync(id);

            if (post != null && post.Content.Contains($"@[{myName}]({myIdString})"))
            {
                post.Content = post.Content.Replace($"@[{myName}]({myIdString})", myName);
                await _context.SaveChangesAsync();
                return Ok(new { message = "Đã gỡ thẻ thành công!" });
            }
            return BadRequest("Không tìm thấy thẻ của bạn trong bài viết này.");
        }

        [HttpPut("comment/{commentId}")]
        public async Task<IActionResult> EditComment(Guid commentId, [FromBody] CreateCommentRequest request)
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var comment = await _context.Comments.FirstOrDefaultAsync(c => c.Id == commentId);

            if (comment == null) return NotFound("Không tìm thấy bình luận.");
            if (comment.UserId != userId) return StatusCode(403, "Bạn không có quyền sửa bình luận này.");

            comment.Content = request.Content;
            comment.UpdatedAt = DateTime.UtcNow;

            _context.Comments.Update(comment);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Đã sửa bình luận", content = comment.Content, updatedAt = comment.UpdatedAt });
        }

        [HttpDelete("comment/{commentId}")]
        public async Task<IActionResult> DeleteComment(Guid commentId)
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var comment = await _context.Comments.FirstOrDefaultAsync(c => c.Id == commentId);

            if (comment == null) return NotFound("Không tìm thấy bình luận.");

            var post = await _context.Posts.FirstOrDefaultAsync(p => p.Id == comment.PostId);
            if (comment.UserId != userId && post?.UserId != userId)
                return StatusCode(403, "Bạn không có quyền xóa bình luận này.");

            _context.Comments.Remove(comment);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Đã xóa bình luận." });
        }

        [HttpGet]
        public async Task<IActionResult> GetNewsfeed([FromQuery] int page = 1, [FromQuery] int pageSize = 10)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier); if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();
            var blockedIds = await _context.Blocks.Where(b => b.BlockerId == myId || b.BlockedId == myId).Select(b => b.BlockerId == myId ? b.BlockedId : b.BlockerId).ToListAsync();
            var followingIds = await _context.Follows.Where(f => f.FollowerId == myId).Select(f => f.FollowingId).ToListAsync();
            var friendIds = await _context.Friendships.Where(f => f.Status == 1 && (f.RequesterId == myId || f.ReceiverId == myId)).Select(f => f.RequesterId == myId ? f.ReceiverId : f.RequesterId).ToListAsync();
            // Tính toán Bạn của Bạn bè (Tầng 2)
            var friendOfFriendIds = await _context.Friendships
                .Where(f => f.Status == 1 && (friendIds.Contains(f.RequesterId) || friendIds.Contains(f.ReceiverId)))
                .Select(f => friendIds.Contains(f.RequesterId) ? f.ReceiverId : f.RequesterId)
                .Where(id => id != myId && !friendIds.Contains(id)) // Bỏ qua chính mình và bạn trực tiếp
                .Distinct()
                .ToListAsync();

            var extendedNetworkIds = friendIds.Concat(friendOfFriendIds).ToList();

            var visibleIds = followingIds.Concat(friendIds).Concat(new[] { myId }).Except(blockedIds).ToList();

            var hiddenIds = await _context.HiddenPosts.Where(hp => hp.UserId == myId).Select(hp => hp.PostId).ToListAsync();
            var posts = await _context.Posts.Where(p => visibleIds.Contains(p.UserId) && !p.IsDeleted && !hiddenIds.Contains(p.Id) &&
                (p.Privacy == 0 ||
                (p.Privacy == 1 && (friendIds.Contains(p.UserId) || p.UserId == myId)) ||
                (p.Privacy == 2 && p.UserId == myId) ||
                (p.Privacy == 3 && (extendedNetworkIds.Contains(p.UserId) || p.UserId == myId))))
                .OrderByDescending(p => p.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();


            var result = new List<object>();
            foreach (var post in posts)
            {
                var author = await _context.Users.FindAsync(post.UserId);
                var existingLike = await _context.PostLikes.FirstOrDefaultAsync(pl => pl.PostId == post.Id && pl.UserId == myId);
                bool isSaved = await _context.SavedPosts.AnyAsync(sp => sp.PostId == post.Id && sp.UserId == myId);
                int commentCount = await _context.Comments.CountAsync(c => c.PostId == post.Id);
                int shareCount = await _context.Posts.CountAsync(p => p.IsShare && p.OriginalPostId == post.Id);
                object? originalPostData = null;
                if (post.IsShare && post.OriginalPostId.HasValue) { var origPost = await _context.Posts.FindAsync(post.OriginalPostId.Value); if (origPost != null && !origPost.IsDeleted) { var origAuthor = await _context.Users.FindAsync(origPost.UserId); originalPostData = new { id = origPost.Id, userId = origPost.UserId, authorName = origPost.AuthorName, authorAvatar = origAuthor?.AvatarUrl ?? "", content = origPost.Content, imageUrl = origPost.ImageUrl, createdAt = origPost.CreatedAt }; } else { originalPostData = "unavailable"; } }
                result.Add(new { id = post.Id, userId = post.UserId, authorName = post.AuthorName, authorAvatar = author?.AvatarUrl ?? "", content = post.Content, imageUrl = post.ImageUrl, likeCount = post.LikeCount, isLiked = existingLike != null, userReaction = existingLike?.ReactionType, isSaved = isSaved, commentCount = commentCount, shareCount = shareCount, createdAt = post.CreatedAt, isShare = post.IsShare, originalPost = originalPostData, privacy = post.Privacy });
            }
            return Ok(result);
        }

        [HttpGet("user/{userId}")]
        public async Task<IActionResult> GetUserPosts(Guid userId)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier); if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();
            bool isFriend = await _context.Friendships.AnyAsync(f => f.Status == 1 && ((f.RequesterId == myId && f.ReceiverId == userId) || (f.RequesterId == userId && f.ReceiverId == myId)));

            // Kiểm tra xem có phải Bạn của Bạn bè không
            bool isFriendOfFriend = false;
            if (!isFriend && myId != userId)
            {
                var myFriends = await _context.Friendships.Where(f => f.Status == 1 && (f.RequesterId == myId || f.ReceiverId == myId)).Select(f => f.RequesterId == myId ? f.ReceiverId : f.RequesterId).ToListAsync();
                var targetFriends = await _context.Friendships.Where(f => f.Status == 1 && (f.RequesterId == userId || f.ReceiverId == userId)).Select(f => f.RequesterId == userId ? f.ReceiverId : f.RequesterId).ToListAsync();
                isFriendOfFriend = myFriends.Intersect(targetFriends).Any();
            }

            var hiddenIds = await _context.HiddenPosts.Where(hp => hp.UserId == myId).Select(hp => hp.PostId).ToListAsync();
            var posts = await _context.Posts.Where(p => p.UserId == userId && !p.IsDeleted && !hiddenIds.Contains(p.Id) &&
                (p.Privacy == 0 ||
                (p.Privacy == 1 && (isFriend || p.UserId == myId)) ||
                (p.Privacy == 2 && p.UserId == myId) ||
                (p.Privacy == 3 && (isFriend || isFriendOfFriend || p.UserId == myId))))
                .OrderByDescending(p => p.CreatedAt).ToListAsync();

            var result = new List<object>();
            foreach (var post in posts)
            {
                var author = await _context.Users.FindAsync(post.UserId);
                var existingLike = await _context.PostLikes.FirstOrDefaultAsync(pl => pl.PostId == post.Id && pl.UserId == myId);
                bool isSaved = await _context.SavedPosts.AnyAsync(sp => sp.PostId == post.Id && sp.UserId == myId);
                int commentCount = await _context.Comments.CountAsync(c => c.PostId == post.Id);
                int shareCount = await _context.Posts.CountAsync(p => p.IsShare && p.OriginalPostId == post.Id);
                object? originalPostData = null;
                if (post.IsShare && post.OriginalPostId.HasValue) { var origPost = await _context.Posts.FindAsync(post.OriginalPostId.Value); if (origPost != null && !origPost.IsDeleted) { var origAuthor = await _context.Users.FindAsync(origPost.UserId); originalPostData = new { id = origPost.Id, userId = origPost.UserId, authorName = origPost.AuthorName, authorAvatar = origAuthor?.AvatarUrl ?? "", content = origPost.Content, imageUrl = origPost.ImageUrl, createdAt = origPost.CreatedAt }; } else { originalPostData = "unavailable"; } }
                result.Add(new { id = post.Id, userId = post.UserId, authorName = post.AuthorName, authorAvatar = author?.AvatarUrl ?? "", content = post.Content, imageUrl = post.ImageUrl, likeCount = post.LikeCount, isLiked = existingLike != null, userReaction = existingLike?.ReactionType, isSaved = isSaved, commentCount = commentCount, shareCount = shareCount, createdAt = post.CreatedAt, isShare = post.IsShare, originalPost = originalPostData, privacy = post.Privacy });
            }
            return Ok(result);
        }

        [HttpGet("saved")]
        public async Task<IActionResult> GetSavedPosts()
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier); if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();
            var savedPostIds = await _context.SavedPosts.Where(sp => sp.UserId == myId).Select(sp => sp.PostId).ToListAsync();
            var posts = await _context.Posts.Where(p => savedPostIds.Contains(p.Id) && !p.IsDeleted).OrderByDescending(p => p.CreatedAt).ToListAsync();
            var result = new List<object>();
            foreach (var post in posts)
            {
                var author = await _context.Users.FindAsync(post.UserId);
                var existingLike = await _context.PostLikes.FirstOrDefaultAsync(pl => pl.PostId == post.Id && pl.UserId == myId);
                int commentCount = await _context.Comments.CountAsync(c => c.PostId == post.Id);
                int shareCount = await _context.Posts.CountAsync(p => p.IsShare && p.OriginalPostId == post.Id);
                object? originalPostData = null;
                if (post.IsShare && post.OriginalPostId.HasValue) { var origPost = await _context.Posts.FindAsync(post.OriginalPostId.Value); if (origPost != null && !origPost.IsDeleted) { var origAuthor = await _context.Users.FindAsync(origPost.UserId); originalPostData = new { id = origPost.Id, userId = origPost.UserId, authorName = origPost.AuthorName, authorAvatar = origAuthor?.AvatarUrl ?? "", content = origPost.Content, imageUrl = origPost.ImageUrl, createdAt = origPost.CreatedAt }; } else { originalPostData = "unavailable"; } }
                result.Add(new { id = post.Id, userId = post.UserId, authorName = post.AuthorName, authorAvatar = author?.AvatarUrl ?? "", content = post.Content, imageUrl = post.ImageUrl, likeCount = post.LikeCount, isLiked = existingLike != null, userReaction = existingLike?.ReactionType, isSaved = true, commentCount = commentCount, shareCount = shareCount, createdAt = post.CreatedAt, isShare = post.IsShare, originalPost = originalPostData, privacy = post.Privacy });
            }
            return Ok(result);
        }

        [HttpPost("{id}/react")]
        public async Task<IActionResult> ReactPost(Guid id, [FromQuery] string type = "Like")
        {
            var post = await _context.Posts.FindAsync(id); if (post == null) return NotFound("Không tìm thấy bài viết này!");
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier); if (!Guid.TryParse(myIdString, out Guid userId)) return Unauthorized();
            var likerName = User.FindFirstValue(ClaimTypes.Name) ?? "Ai đó"; var existingReaction = await _context.PostLikes.FirstOrDefaultAsync(pl => pl.PostId == id && pl.UserId == userId);

            if (existingReaction != null)
            {
                if (existingReaction.ReactionType == type)
                {
                    _context.PostLikes.Remove(existingReaction);
                    post.LikeCount = Math.Max(0, post.LikeCount - 1);
                    await _context.SaveChangesAsync();
                    return Ok(new { message = "Đã hủy cảm xúc", currentLikes = post.LikeCount, userReaction = (string?)null });
                }
                else
                {
                    existingReaction.ReactionType = type;
                    await _context.SaveChangesAsync();
                    return Ok(new { message = $"Đã bày tỏ {type}", currentLikes = post.LikeCount, userReaction = type });
                }
            }
            else
            {
                _context.PostLikes.Add(new PostLike { PostId = id, UserId = userId, ReactionType = type });
                post.LikeCount += 1;

                if (userId != post.UserId)
                {
                    var notif = new Notification { UserId = post.UserId, SenderId = userId, Type = "Reaction", RelatedId = post.Id, Content = $"{likerName} đã bày tỏ cảm xúc về bài viết của bạn!" };
                    _context.Notifications.Add(notif);

                    // SignalR bóp cò cho Cảm xúc
                    await _hubContext.Clients.User(post.UserId.ToString()).SendAsync("ReceiveNotification", notif.Content, notif.Type, notif.SenderId.ToString(), notif.RelatedId.ToString());
                }
                await _context.SaveChangesAsync();
                return Ok(new { message = $"Đã bày tỏ {type}", currentLikes = post.LikeCount, userReaction = type });
            }
        }

        [HttpGet("{id}/comments")]
        public async Task<IActionResult> GetComments(Guid id)
        {
            var comments = await _context.Comments.Where(c => c.PostId == id).OrderBy(c => c.CreatedAt).ToListAsync();
            var result = new List<object>();
            foreach (var c in comments)
            {
                var author = await _context.Users.FindAsync(c.UserId);
                result.Add(new { id = c.Id, userId = c.UserId, authorName = c.AuthorName, authorAvatar = author?.AvatarUrl ?? "", content = c.Content, createdAt = c.CreatedAt, parentCommentId = c.ParentCommentId, updatedAt = c.UpdatedAt });
            }
            return Ok(result);
        }

        [HttpPost("{originalPostId}/share")]
        public async Task<IActionResult> SharePost(Guid originalPostId, [FromBody] CreatePostRequest request)
        {
            var myIdString = User.FindFirstValue(ClaimTypes.NameIdentifier); var myName = User.FindFirstValue(ClaimTypes.Name); if (!Guid.TryParse(myIdString, out Guid myId)) return Unauthorized();
            var originalPost = await _context.Posts.FindAsync(originalPostId); if (originalPost == null || originalPost.IsDeleted) return NotFound("Bài viết gốc không tồn tại!");
            var user = await _context.Users.FindAsync(myId);
            var sharePost = new Post { UserId = myId, AuthorName = myName ?? "Người dùng", Content = request.Content ?? "", IsShare = true, OriginalPostId = originalPostId, Privacy = user != null ? user.PostDefaultVisibility : 0, CreatedAt = DateTime.UtcNow };
            _context.Posts.Add(sharePost);

            if (originalPost.UserId != myId)
            {
                var notif = new Notification { UserId = originalPost.UserId, SenderId = myId, Type = "Share", RelatedId = sharePost.Id, Content = $"{myName} đã chia sẻ bài viết của bạn!" };
                _context.Notifications.Add(notif);

                // SignalR bóp cò cho Share
                await _hubContext.Clients.User(originalPost.UserId.ToString()).SendAsync("ReceiveNotification", notif.Content, notif.Type, notif.SenderId.ToString(), notif.RelatedId.ToString());
            }
            await _context.SaveChangesAsync();
            return Ok(new { message = "Chia sẻ bài viết thành công!", sharePost });
        }

        [HttpPost("{id}/save")]
        public async Task<IActionResult> ToggleSavePost(Guid id)
        {
            var post = await _context.Posts.FindAsync(id); if (post == null || post.IsDeleted) return NotFound("Bài viết không tồn tại!");
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)); var existingSave = await _context.SavedPosts.FirstOrDefaultAsync(sp => sp.PostId == id && sp.UserId == myId);
            if (existingSave != null) { _context.SavedPosts.Remove(existingSave); await _context.SaveChangesAsync(); return Ok(new { message = "Đã bỏ lưu bài viết", isSaved = false }); }
            else { _context.SavedPosts.Add(new SavedPost { PostId = id, UserId = myId }); await _context.SaveChangesAsync(); return Ok(new { message = "Đã lưu bài viết vào Bộ sưu tập!", isSaved = true }); }
        }
        [HttpPost("{id}/hide")]
        public async Task<IActionResult> HidePost(Guid id)
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            if (!await _context.HiddenPosts.AnyAsync(hp => hp.UserId == myId && hp.PostId == id))
            {
                _context.HiddenPosts.Add(new HiddenPost { UserId = myId, PostId = id });
                await _context.SaveChangesAsync();
            }
            return Ok(new { message = "Đã ẩn bài viết" });
        }

        [HttpDelete("{id}/hide")]
        public async Task<IActionResult> UnhidePost(Guid id)
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var hp = await _context.HiddenPosts.FirstOrDefaultAsync(h => h.UserId == myId && h.PostId == id);
            if (hp != null) { _context.HiddenPosts.Remove(hp); await _context.SaveChangesAsync(); }
            return Ok(new { message = "Đã bỏ ẩn bài viết" });
        }

        [HttpGet("hidden")]
        public async Task<IActionResult> GetHiddenPosts()
        {
            var myId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var hiddenIds = await _context.HiddenPosts.Where(hp => hp.UserId == myId).Select(hp => hp.PostId).ToListAsync();
            var posts = await _context.Posts.Where(p => hiddenIds.Contains(p.Id)).OrderByDescending(p => p.CreatedAt).ToListAsync();

            var result = new List<object>();
            foreach (var post in posts)
            {
                var author = await _context.Users.FindAsync(post.UserId);
                result.Add(new { id = post.Id, authorName = post.AuthorName, authorAvatar = author?.AvatarUrl ?? "", content = post.Content });
            }
            return Ok(result);
        }

    }

}


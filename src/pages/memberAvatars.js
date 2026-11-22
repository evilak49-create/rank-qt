const avatars = import.meta.glob('../assets/avatars/*.jpg', {
  eager: true, import: 'default', query: '?url',
})
export const memberAvatars = Object.entries(avatars).sort().map(([path, url]) => ({
  id: path.split('/').pop().slice(0, -4),
  url,
}))

export function avatarForReview(reviewId) {
  let hash = 0
  for (const character of String(reviewId)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return memberAvatars[(hash >>> 0) % memberAvatars.length]?.url
}

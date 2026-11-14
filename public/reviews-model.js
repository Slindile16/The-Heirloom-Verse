export function validateReview(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 40)
    throw new Error('Enter a display name of 1–40 characters.');
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
    throw new Error('Choose a rating from 1 to 5 stars.');
  if (typeof input.comment !== 'string' || input.comment.trim().length < 10 || input.comment.trim().length > 1000)
    throw new Error('Write a review of 10–1,000 characters.');
  return { name: input.name.trim(), rating: input.rating, comment: input.comment.trim() };
}

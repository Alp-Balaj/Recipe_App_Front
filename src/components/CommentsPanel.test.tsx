import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute, TEST_USER } from '@/test/utils'
import type { CommentListResponse, CommentResponse, FeedItemResponse, FeedListResponse } from '@/api/social'
import type { RecipeResponse } from '@/api/types'

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `cmt-r${idSeq}`,
    title: `Commentable ${idSeq}`,
    description: 'Discuss.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    totalTimeMinutes: 25,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: null,
    caloriesPerServing: null,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: null,
    ingredients: [],
    steps: [],
    tags: [],
    createdByUserId: 'author-1',
    ...over,
  }
}

function makeComment(over: Partial<CommentResponse> = {}): CommentResponse {
  idSeq += 1
  return {
    id: `c${idSeq}`,
    content: `Comment body ${idSeq}`,
    createdAt: '2026-07-02T00:00:00Z',
    updatedAt: null,
    authorId: 'commenter-1',
    authorUsername: 'sam_cooks',
    recipeId: 'cmt-r1',
    ...over,
  }
}

/** One-item /feed whose card we open comments on. Returns the recipe. */
function givenFeedWithItem(item: Partial<FeedItemResponse> = {}, recipe: Partial<RecipeResponse> = {}) {
  const r = makeRecipe(recipe)
  server.use(
    http.get('*/feed', () =>
      HttpResponse.json({
        items: [
          {
            recipe: r,
            author: { id: 'author-1', username: 'chef_ana', profileImageUrl: null },
            likeCount: 0,
            commentCount: 2,
            likedByMe: false,
            savedByMe: false,
            ...item,
          },
        ],
        nextCursor: null,
        source: 'following',
      } satisfies FeedListResponse),
    ),
  )
  return r
}

async function openSheet(commentCount = 2) {
  await userEvent.click(await screen.findByRole('button', { name: `${commentCount} comments` }))
  return await screen.findByRole('dialog', { name: 'Comments' })
}

describe('Comment sheet (feed card, mobile bottom sheet)', () => {
  it('opens from the comment affordance and lists testimonial rows', async () => {
    givenFeedWithItem()
    server.use(
      http.get('*/recipes/:id/comments', () =>
        HttpResponse.json({
          items: [
            makeComment({ content: 'Newest take', authorUsername: 'sam_cooks' }),
            makeComment({ content: 'Older take', authorUsername: 'pat_bakes', authorId: 'commenter-2' }),
          ],
          nextCursor: null,
        } satisfies CommentListResponse),
      ),
    )
    renderRoute('/feed')

    const sheet = await openSheet()
    expect(await within(sheet).findByText('Newest take')).toBeInTheDocument()
    expect(within(sheet).getByText('Older take')).toBeInTheDocument()
    expect(within(sheet).getByText('sam_cooks')).toBeInTheDocument()
    expect(within(sheet).getByText('pat_bakes')).toBeInTheDocument()
  })

  it('walks keyset pages via View more comments, passing nextCursor back verbatim', async () => {
    givenFeedWithItem()
    const cursors: (string | null)[] = []
    server.use(
      http.get('*/recipes/:id/comments', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        cursors.push(cursor)
        if (!cursor) {
          return HttpResponse.json({
            items: [makeComment({ content: 'Page one comment' })],
            nextCursor: 'CCUR2',
          })
        }
        return HttpResponse.json({ items: [makeComment({ content: 'Page two comment' })], nextCursor: null })
      }),
    )
    renderRoute('/feed')

    const sheet = await openSheet()
    expect(await within(sheet).findByText('Page one comment')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByText('View more comments'))
    expect(await within(sheet).findByText('Page two comment')).toBeInTheDocument()
    expect(within(sheet).getAllByText('Page one comment')).toHaveLength(1)
    expect(cursors).toEqual([null, 'CCUR2'])
  })

  it('adds a comment (201) and bumps the card count without refetching the feed', async () => {
    let feedFetches = 0
    const r = makeRecipe({ id: 'add-1' })
    server.use(
      http.get('*/feed', () => {
        feedFetches += 1
        return HttpResponse.json({
          items: [
            {
              recipe: r,
              author: { id: 'author-1', username: 'chef_ana', profileImageUrl: null },
              likeCount: 0,
              commentCount: 2,
              likedByMe: false,
              savedByMe: false,
            },
          ],
          nextCursor: null,
          source: 'following',
        } satisfies FeedListResponse)
      }),
      http.post('*/recipes/:id/comments', async ({ request }) => {
        const body = (await request.json()) as { content: string }
        return HttpResponse.json(
          makeComment({
            content: body.content,
            authorId: TEST_USER.userId,
            authorUsername: TEST_USER.username,
            recipeId: 'add-1',
          }),
          { status: 201 },
        )
      }),
    )
    renderRoute('/feed')

    const sheet = await openSheet()
    await within(sheet).findByText('No comments yet — be the first.')

    await userEvent.type(within(sheet).getByLabelText('Add a comment'), 'Adding flavor')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Post' }))

    expect(await within(sheet).findByText('Adding flavor')).toBeInTheDocument()
    // Envelope bumped in place: 2 → 3, exactly one feed fetch.
    expect(await screen.findByRole('button', { name: '3 comments' })).toBeInTheDocument()
    expect(feedFetches).toBe(1)
    // Composer cleared for the next comment.
    expect(within(sheet).getByLabelText('Add a comment')).toHaveValue('')
  })

  it('disables Post while the composer is empty', async () => {
    givenFeedWithItem()
    renderRoute('/feed')
    const sheet = await openSheet()
    expect(within(sheet).getByRole('button', { name: 'Post' })).toBeDisabled()
  })

  it('surfaces a validation failure legibly', async () => {
    givenFeedWithItem()
    server.use(
      http.post('*/recipes/:id/comments', () =>
        HttpResponse.json(
          { title: 'Validation failed', errors: { Content: ['Content is required.'] } },
          { status: 400 },
        ),
      ),
    )
    renderRoute('/feed')

    const sheet = await openSheet()
    await userEvent.type(within(sheet).getByLabelText('Add a comment'), 'x')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Post' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Content is required.')
  })

  it('edits an own comment via PUT and shows the edited marker', async () => {
    givenFeedWithItem()
    const puts: { id: string; content: string }[] = []
    server.use(
      http.get('*/recipes/:id/comments', () =>
        HttpResponse.json({
          items: [
            makeComment({
              id: 'mine-1',
              content: 'Origimal text',
              authorId: TEST_USER.userId,
              authorUsername: TEST_USER.username,
            }),
          ],
          nextCursor: null,
        } satisfies CommentListResponse),
      ),
      http.put('*/comments/:id', async ({ params, request }) => {
        const body = (await request.json()) as { content: string }
        puts.push({ id: String(params.id), content: body.content })
        return HttpResponse.json(
          makeComment({
            id: 'mine-1',
            content: body.content,
            updatedAt: '2026-07-03T00:00:00Z',
            authorId: TEST_USER.userId,
            authorUsername: TEST_USER.username,
          }),
        )
      }),
    )
    renderRoute('/feed')

    const sheet = await openSheet()
    await userEvent.click(await within(sheet).findByRole('button', { name: `Edit comment by ${TEST_USER.username}` }))
    const area = within(sheet).getByLabelText('Edit comment')
    await userEvent.clear(area)
    await userEvent.type(area, 'Original text')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))

    expect(await within(sheet).findByText('Original text')).toBeInTheDocument()
    expect(within(sheet).getByText(/edited/)).toBeInTheDocument()
    expect(puts).toEqual([{ id: 'mine-1', content: 'Original text' }])
  })

  it('deletes an own comment and drops the card count', async () => {
    givenFeedWithItem()
    const deletes: string[] = []
    server.use(
      http.get('*/recipes/:id/comments', () =>
        HttpResponse.json({
          items: [
            makeComment({
              id: 'mine-2',
              content: 'Delete me',
              authorId: TEST_USER.userId,
              authorUsername: TEST_USER.username,
            }),
          ],
          nextCursor: null,
        } satisfies CommentListResponse),
      ),
      http.delete('*/comments/:id', ({ params }) => {
        deletes.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/feed')

    const sheet = await openSheet()
    await userEvent.click(
      await within(sheet).findByRole('button', { name: `Delete comment by ${TEST_USER.username}` }),
    )

    await waitFor(() => expect(within(sheet).queryByText('Delete me')).not.toBeInTheDocument())
    expect(deletes).toEqual(['mine-2'])
    // 2 → 1 in the card's envelope.
    expect(await screen.findByRole('button', { name: '1 comments' })).toBeInTheDocument()
  })

  it("offers recipe-author delete (I6) on strangers' comments — but never edit", async () => {
    // The RECIPE is ours; the comment is someone else's.
    givenFeedWithItem({}, { createdByUserId: TEST_USER.userId })
    server.use(
      http.get('*/recipes/:id/comments', () =>
        HttpResponse.json({
          items: [makeComment({ content: 'Rude take', authorUsername: 'sam_cooks' })],
          nextCursor: null,
        } satisfies CommentListResponse),
      ),
    )
    renderRoute('/feed')

    const sheet = await openSheet()
    expect(await within(sheet).findByRole('button', { name: 'Delete comment by sam_cooks' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Edit comment by sam_cooks' })).not.toBeInTheDocument()
  })

  it("shows NO actions on strangers' comments on strangers' recipes", async () => {
    givenFeedWithItem() // recipe by author-1, comment by commenter-1 — neither is us
    server.use(
      http.get('*/recipes/:id/comments', () =>
        HttpResponse.json({
          items: [makeComment({ content: 'Bystander view', authorUsername: 'sam_cooks' })],
          nextCursor: null,
        } satisfies CommentListResponse),
      ),
    )
    renderRoute('/feed')

    const sheet = await openSheet()
    await within(sheet).findByText('Bystander view')
    expect(within(sheet).queryByRole('button', { name: /Delete comment/ })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /Edit comment/ })).not.toBeInTheDocument()
  })

  it('surfaces a 403 delete rejection legibly (I6 enforced server-side)', async () => {
    givenFeedWithItem({}, { createdByUserId: TEST_USER.userId })
    server.use(
      http.get('*/recipes/:id/comments', () =>
        HttpResponse.json({
          items: [makeComment({ content: 'Protected take', authorUsername: 'sam_cooks' })],
          nextCursor: null,
        } satisfies CommentListResponse),
      ),
      http.delete('*/comments/:id', () => new HttpResponse(null, { status: 403 })),
    )
    renderRoute('/feed')

    const sheet = await openSheet()
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Delete comment by sam_cooks' }))

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(/only the comment's author/i)
    // Nothing was removed.
    expect(within(sheet).getByText('Protected take')).toBeInTheDocument()
  })
})

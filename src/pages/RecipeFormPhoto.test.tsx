// Photo-upload UI (social-feed cp07) — NEW test file; the pre-existing
// RecipeFormPage.test.tsx stays byte-untouched per the parallel-work contract.
//
// Covers: select → multipart POST /images (part name `file`, bearer attached)
// → returned RELATIVE url stored in the imageUrl field + previewed through
// resolveImageUrl; in-flight upload blocks submit (local objectURL preview);
// server 400/401/429 surfaced legibly with the form still usable; client-side
// type/size pre-checks that never spend the 20/min rate budget; remove/replace
// affordances; edit-overlay prefill preview.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute, TEST_USER } from '@/test/utils'
import { IMAGE_MAX_BYTES } from '@/api/images'
import type { CreateRecipeRequest, RecipeResponse } from '@/api/types'

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeRecipeResponse(overrides: Partial<RecipeResponse> = {}): RecipeResponse {
  return {
    id: 'new-recipe-77',
    title: 'Saved',
    description: 'desc',
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    totalTimeMinutes: 30,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: null,
    caloriesPerServing: null,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    ingredients: [],
    steps: [],
    tags: [],
    createdByUserId: TEST_USER.userId,
    ...overrides,
  }
}

/** A tiny in-memory PNG-typed File (content is irrelevant — MSW mocks the wire). */
function makePngFile(name = 'photo.png'): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })
}

/** Fill the minimal valid field set so submit passes zod. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Title'), 'Shakshuka')
  await user.type(screen.getByLabelText('Description'), 'Eggs in tomato sauce')
  await user.type(screen.getByLabelText('Prep (min)'), '10')
  await user.type(screen.getByLabelText('Cook (min)'), '20')
  await user.type(screen.getByLabelText('Servings'), '2')
  await user.type(screen.getByLabelText('Ingredient 1 quantity'), '4')
  await user.type(screen.getByLabelText('Ingredient 1 unit'), 'pcs')
  await user.type(screen.getByLabelText('Ingredient 1 name'), 'Eggs')
  await user.type(screen.getByLabelText('Step 1 instruction'), 'Simmer the sauce')
}

/** Register a POST recipes capture and return the captured-body accessor. */
function captureRecipePost() {
  let captured: CreateRecipeRequest | null = null
  server.use(
    http.post('*/recipes', async ({ request }) => {
      captured = (await request.json()) as CreateRecipeRequest
      return HttpResponse.json(makeRecipeResponse(), { status: 201 })
    }),
  )
  return () => captured
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RecipeForm photo upload (cp07)', () => {
  it('uploads the selected file as multipart part "file" (bearer attached) and stores the returned url', async () => {
    const user = userEvent.setup()
    // NOTE: reading a multipart body inside an MSW handler (request.formData()
    // OR request.text()) hangs under jsdom — jsdom's FormData/File can't be
    // re-streamed by the interceptor. So the wire shape is captured at the
    // fetch boundary with a delegating spy; the live smoke proves the real
    // multipart wire against the actual backend.
    let capturedForm: FormData | null = null
    let credentialsMode: RequestCredentials | undefined
    const realFetch = globalThis.fetch
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof input === 'string' && input.endsWith('/api/images')) {
          capturedForm = init?.body instanceof FormData ? init.body : null
          credentialsMode = init?.credentials
        }
        return realFetch(input, init)
      })
    server.use(
      http.post('*/images', () =>
        HttpResponse.json({ url: '/images/abc123.png' }, { status: 201 }),
      ),
    )
    const getBody = captureRecipePost()

    renderRoute('/recipes/new')
    await user.upload(await screen.findByLabelText('Add photo'), makePngFile())

    // Preview renders the RELATIVE url through resolveImageUrl (/api prefix).
    // waitFor: a transient local object-URL preview may render first.
    await vi.waitFor(() =>
      expect(screen.getByAltText('Recipe photo preview')).toHaveAttribute(
        'src',
        '/api/images/abc123.png',
      ),
    )
    // Multipart part is named `file` (the cp04 contract) and carries the file.
    expect(capturedForm).not.toBeNull()
    const part = capturedForm!.get('file')
    expect(part).toBeInstanceOf(File)
    expect((part as File).name).toBe('photo.png')
    // KAN-20: no Authorization header at all. What carries the session is the
    // cookie jar, which only rides along because the request opts in to it — so
    // that opt-in is the thing worth pinning, and dropping it would silently 401
    // every upload in production while every test here still passed.
    expect(
      (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls,
    ).not.toHaveLength(0)
    expect(credentialsMode).toBe('same-origin')
    fetchSpy.mockRestore()
    // The affordance flips to replace mode; remove appears.
    expect(screen.getByLabelText('Replace photo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()

    // The url rides the normal submit into CreateRecipeRequest.imageUrl.
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /publish recipe/i }))
    await vi.waitFor(() => expect(getBody()).not.toBeNull())
    expect(getBody()!.imageUrl).toBe('/images/abc123.png')
  })

  describe('with a stubbed object-URL (Node\'s native one rejects jsdom Files)', () => {
    const realCreate = URL.createObjectURL
    const realRevoke = URL.revokeObjectURL
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:local-preview-1')
      URL.revokeObjectURL = vi.fn()
    })
    afterEach(() => {
      URL.createObjectURL = realCreate
      URL.revokeObjectURL = realRevoke
    })

    it('shows a local preview and blocks submit while the upload is in flight', async () => {
      const user = userEvent.setup()
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      server.use(
        http.post('*/images', async () => {
          await gate
          return HttpResponse.json({ url: '/images/slow.png' }, { status: 201 })
        }),
      )

      renderRoute('/recipes/new')
      await user.upload(await screen.findByLabelText('Add photo'), makePngFile())

      // Pending: local objectURL preview, status line, submit disabled.
      const pendingPreview = await screen.findByAltText('Recipe photo preview')
      expect(pendingPreview).toHaveAttribute('src', 'blob:local-preview-1')
      expect(screen.getByRole('status')).toHaveTextContent('Uploading photo…')
      expect(screen.getByRole('button', { name: /uploading photo/i })).toBeDisabled()

      release()

      // Settled: server url preview, submit unblocked, objectURL revoked.
      await vi.waitFor(() =>
        expect(screen.getByAltText('Recipe photo preview')).toHaveAttribute(
          'src',
          '/api/images/slow.png',
        ),
      )
      expect(screen.getByRole('button', { name: /publish recipe/i })).toBeEnabled()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview-1')
    })
  })

  it('surfaces a backend 400 legibly and the form still submits without a photo', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/images', () =>
        HttpResponse.json(
          {
            title: 'Validation failed',
            status: 400,
            errors: { file: ['The file does not look like a supported image.'] },
          },
          { status: 400 },
        ),
      ),
    )
    const getBody = captureRecipePost()

    renderRoute('/recipes/new')
    await user.upload(await screen.findByLabelText('Add photo'), makePngFile())

    expect(
      await screen.findByText('The file does not look like a supported image.'),
    ).toBeInTheDocument()
    expect(screen.queryByAltText('Recipe photo preview')).not.toBeInTheDocument()

    // The recipe form stays usable — photo stays optional.
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /publish recipe/i }))
    await vi.waitFor(() => expect(getBody()).not.toBeNull())
    expect(getBody()!.imageUrl).toBeNull()
  })

  it('surfaces a 429 from the images rate lane legibly', async () => {
    const user = userEvent.setup()
    server.use(http.post('*/images', () => new HttpResponse(null, { status: 429 })))

    renderRoute('/recipes/new')
    await user.upload(await screen.findByLabelText('Add photo'), makePngFile())

    expect(
      await screen.findByText('Too many uploads right now — wait a minute and try again.'),
    ).toBeInTheDocument()
  })

  it('surfaces a 401 legibly', async () => {
    const user = userEvent.setup()
    server.use(http.post('*/images', () => new HttpResponse(null, { status: 401 })))

    renderRoute('/recipes/new')
    await user.upload(await screen.findByLabelText('Add photo'), makePngFile())

    expect(
      await screen.findByText('Your session has expired — please sign in again.'),
    ).toBeInTheDocument()
  })

  it('rejects an oversized file client-side without spending an upload', async () => {
    const user = userEvent.setup()
    const postSpy = vi.fn()
    server.use(
      http.post('*/images', () => {
        postSpy()
        return HttpResponse.json({ url: '/images/never.png' }, { status: 201 })
      }),
    )

    renderRoute('/recipes/new')
    const big = new File([new Uint8Array(IMAGE_MAX_BYTES + 1)], 'big.png', { type: 'image/png' })
    await user.upload(await screen.findByLabelText('Add photo'), big)

    expect(
      await screen.findByText('That image is too large — the limit is 5 MB.'),
    ).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('rejects a disallowed type client-side without spending an upload', async () => {
    // applyAccept:false — a real browser can hand over a non-accepted file
    // (drag-drop / "All files"), which is exactly the branch under test.
    const user = userEvent.setup({ applyAccept: false })
    const postSpy = vi.fn()
    server.use(
      http.post('*/images', () => {
        postSpy()
        return HttpResponse.json({ url: '/images/never.gif' }, { status: 201 })
      }),
    )

    renderRoute('/recipes/new')
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], 'anim.gif', { type: 'image/gif' })
    await user.upload(await screen.findByLabelText('Add photo'), gif)

    expect(
      await screen.findByText('That file type is not supported — choose a JPEG, PNG, or WebP image.'),
    ).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('remove photo clears the stored url and the form submits with imageUrl null', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/images', () => HttpResponse.json({ url: '/images/gone.png' }, { status: 201 })),
    )
    const getBody = captureRecipePost()

    renderRoute('/recipes/new')
    await user.upload(await screen.findByLabelText('Add photo'), makePngFile())
    await vi.waitFor(() =>
      expect(screen.getByAltText('Recipe photo preview')).toHaveAttribute(
        'src',
        '/api/images/gone.png',
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(screen.queryByAltText('Recipe photo preview')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Add photo')).toBeInTheDocument()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /publish recipe/i }))
    await vi.waitFor(() => expect(getBody()).not.toBeNull())
    expect(getBody()!.imageUrl).toBeNull()
  })

  it('edit overlay prefills the existing photo as a resolved preview', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/recipes/mine', () =>
        HttpResponse.json({
          items: [
            makeRecipeResponse({
              id: 'mine-1',
              title: 'Seeded',
              imageUrl: '/images/seeded.webp',
              ingredients: [{ name: 'Salt', quantity: 1, unit: 'Teaspoon' }],
              steps: [{ stepNumber: 1, description: 'Mix', durationSeconds: null }],
            }),
          ],
          nextCursor: null,
        }),
      ),
    )

    renderRoute('/recipes/mine')
    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog', { name: 'Edit recipe' })
    const preview = await within(dialog).findByAltText('Recipe photo preview')
    expect(preview).toHaveAttribute('src', '/api/images/seeded.webp')
    expect(within(dialog).getByLabelText('Replace photo')).toBeInTheDocument()
  })
})

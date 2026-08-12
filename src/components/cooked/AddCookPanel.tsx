// ─────────────────────────────────────────────────────────────────────────
// "Add a cook" — recording a meal you already made (KAN-6).
//
// This is what makes Cooked trustworthy. Without it the collection quietly omits
// every cook the app did not happen to observe, and the dishes most worth adding
// are exactly the ones it never saw: old favourites, cooked long before anyone
// opened this app.
//
// Two steps, and the order is the point. You pick the DISH first, because that
// is the thing you have to search for and the thing you might not find; the day
// is a two-second answer you give once you know it is worth giving. Asking for
// the date first would make a user commit to a day before knowing whether the
// recipe is even here.
//
// The picker is PickerContent — the same one the meal planner uses, unchanged
// apart from which lens it opens on. Its "All" segment reaches every recipe the
// user can SEE, not just their saved ones, which the ticket calls out
// specifically: a saved-only corpus fails the exact case this feature exists for.
// Since KAN-17, All also SEARCHES the server rather than only the pages already
// loaded, so a dish deep in a large public corpus is found by typing it rather
// than by pressing "Show more" until it turns up.
//
// The second step is CookWhenForm, which KAN-7 moved out of this file so the
// recipe page's "track this cook" prompt could reach the same date field rather
// than grow one of its own. Its header comment carries the date-bound reasoning.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import PickerContent from '@/components/mealplan/PickerContent'
import CookWhenForm, { type ChosenDish } from './CookWhenForm'

interface Props {
  onClose: () => void
  /** Fired once the cook has landed, so the opener can say so. */
  onAdded?: (title: string) => void
}

export default function AddCookPanel({ onClose, onAdded }: Props) {
  const [chosen, setChosen] = useState<ChosenDish | null>(null)

  return (
    <Modal onClose={onClose} label="Add a cook" variant="sheet">
      {chosen ? (
        <CookWhenForm
          chosen={chosen}
          onBack={() => setChosen(null)}
          onCancel={onClose}
          onLogged={() => {
            onAdded?.(chosen.title)
            onClose()
          }}
        />
      ) : (
        <PickerContent
          question="What did you cook?"
          subtitle="Adding to Cooked"
          variant="sheet"
          // Not "your recipes". The whole point of this picker being here is
          // that it reaches everything you can see — the dish you are trying to
          // record is very likely one you never saved, which is why it is
          // missing from Cooked in the first place.
          searchLabel="Search all recipes"
          // Open on All rather than the planner's "what you cooked before". The
          // dish being recorded is, by definition, one Cooked does not have —
          // very often one the user never saved either — so every personal lens
          // is the wrong place to start looking for it.
          defaultSegment="all"
          onClose={onClose}
          // The title comes from the row the user was looking at, so the next
          // step names the dish they picked rather than making them wait for a
          // round trip to learn something that was already on screen.
          onPick={(recipeId, recipe) => setChosen({ id: recipeId, title: recipe.title })}
        />
      )}
    </Modal>
  )
}

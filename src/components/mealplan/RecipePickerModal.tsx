// ─────────────────────────────────────────────────────────────────────────
// The overlay form of the recipe picker (meal-plan redesign, picker PR).
//
// Was: a sheet listing everyone's public recipes, newest first, with no search
// and no idea which slot you'd tapped. The list itself now lives in
// PickerContent — this file is only the container, so the docked panel on the
// day page and this overlay can never drift apart.
//
// Container by width, deliberately: a bottom sheet on a phone (thumb-reachable,
// and the day stays visible above it), a top sheet on wider screens where the
// week board has no room to dock a panel.
// ─────────────────────────────────────────────────────────────────────────

import { useMediaQuery } from '@/hooks/useMediaQuery'
import Modal from '@/components/ui/Modal'
import PickerContent from './PickerContent'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (recipeId: string) => void
  /** The question to head the picker with — the slot that was tapped. */
  question?: string
  subtitle?: string
  /** recipeId → where it already sits this week, for the duplicate chip. */
  plannedDays?: Map<string, string>
  /** Normalised names the day already needs, for the shopping consequence. */
  alreadyNeeded?: ReadonlySet<string>
  /** Where fill mode goes next, named before the tap. */
  nextHint?: string
}

export default function RecipePickerModal({
  open,
  onClose,
  onPick,
  question = 'Choose a recipe',
  subtitle,
  plannedDays,
  alreadyNeeded,
  nextHint,
}: Props) {
  if (!open) return null
  return (
    <PickerSheet
      onClose={onClose}
      onPick={onPick}
      question={question}
      subtitle={subtitle}
      plannedDays={plannedDays}
      alreadyNeeded={alreadyNeeded}
      nextHint={nextHint}
    />
  )
}

/**
 * Split out so the corpus queries inside PickerContent only mount — and only
 * fetch — while the picker is actually open.
 */
function PickerSheet({
  onClose,
  onPick,
  question,
  subtitle,
  plannedDays,
  alreadyNeeded,
  nextHint,
}: {
  onClose: () => void
  onPick: (recipeId: string) => void
  question: string
  subtitle?: string
  plannedDays?: Map<string, string>
  alreadyNeeded?: ReadonlySet<string>
  nextHint?: string
}) {
  const isWide = useMediaQuery('(min-width: 768px)')

  return (
    <Modal onClose={onClose} label={question} variant={isWide ? 'sheet' : 'bottom'}>
      <PickerContent
        question={question}
        subtitle={subtitle}
        onPick={onPick}
        onClose={onClose}
        plannedDays={plannedDays}
        alreadyNeeded={alreadyNeeded}
        nextHint={nextHint}
        variant="sheet"
      />
    </Modal>
  )
}

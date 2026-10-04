/**
 * The held-out set for the role check, held beside the evals because it exists
 * for them.
 *
 * Convention assigns these roles from the path alone, and in normal operation
 * files convention labelled this way never reach the model — which is what
 * makes them ground truth rather than a second opinion. The roles measured here
 * (component, hook) are ones the classifier is allowed to answer; a file whose
 * conventional role the classifier may not name would score a question it is
 * forbidden to answer.
 *
 * The files carry no real code on purpose: the convention being measured is
 * path-based, and the ground truth comes from running the real parser over
 * these files, not from a role typed next to each path. What is written here is
 * a file list, and the parser is what turns it into a labelled dataset.
 */
const FIXTURE_PATHS: readonly string[] = [
  "src/components/Button.tsx",
  "src/components/Card.tsx",
  "src/components/Modal.tsx",
  "src/components/Sidebar.tsx",
  "src/components/Header.tsx",
  "src/components/Avatar.tsx",
  "src/components/Badge.tsx",
  "src/components/Spinner.tsx",
  "src/components/Toast.tsx",
  "src/components/Tooltip.tsx",
  "src/components/Table.tsx",
  "src/components/Dialog.tsx",
  "src/components/Dropdown.tsx",
  "src/components/Tabs.tsx",
  "src/components/Form.tsx",
  "src/components/Input.tsx",
  "src/components/Select.tsx",
  "src/components/Switch.tsx",
  "src/features/auth/LoginForm.tsx",
  "src/features/auth/SignupForm.tsx",
  "src/features/billing/InvoiceList.tsx",
  "src/features/billing/PlanPicker.tsx",
  "src/features/dashboard/StatCard.tsx",
  "src/features/dashboard/ActivityFeed.tsx",
  "src/hooks/useAuth.ts",
  "src/hooks/useDebounce.ts",
  "src/hooks/useLocalStorage.ts",
  "src/hooks/useFetch.ts",
  "src/hooks/usePagination.ts",
  "src/hooks/useTheme.ts",
  "src/hooks/useOnClickOutside.ts",
  "src/hooks/useMediaQuery.ts",
  "src/features/auth/useSession.ts",
  "src/features/dashboard/useStats.ts",
];

const FIXTURE_SOURCE = "export const placeholder = true;\n";

/** The fixture as files to write before the parser reads them. */
export const ROLE_FIXTURE: readonly { path: string; text: string }[] = FIXTURE_PATHS.map(
  (path) => ({ path, text: FIXTURE_SOURCE }),
);

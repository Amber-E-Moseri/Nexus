export default function PageSpinner() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-(--accent) border-t-transparent" />
    </div>
  )
}

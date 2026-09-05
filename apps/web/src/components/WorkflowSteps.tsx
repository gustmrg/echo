export default function WorkflowSteps({
  stage,
}: {
  stage: 'capture' | 'review' | 'refine'
}) {
  return (
    <ol className="workflow-steps" aria-label="Recording workflow">
      {(['capture', 'review', 'refine'] as const).map((value, i) => (
        <li key={value} aria-current={value === stage ? 'step' : undefined}>
          <span>0{i + 1}</span>{' '}
          {value === 'refine'
            ? 'Refine & export'
            : value === 'review'
              ? 'Review'
              : 'Capture'}
        </li>
      ))}
    </ol>
  )
}

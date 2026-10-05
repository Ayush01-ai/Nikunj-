import { useDocumentOperation, type DocumentActionComponent } from 'sanity';

type ReviewDoc = { status?: string } | null;

export const ApproveReviewAction: DocumentActionComponent = (props) => {
  const { patch, publish } = useDocumentOperation(props.id, props.type);
  const doc = (props.draft ?? props.published) as ReviewDoc;
  if (doc?.status === 'approved' && !props.draft) return null;

  return {
    label: 'Approve & Publish',
    tone: 'positive',
    onHandle: () => {
      // Phone numbers stay private: drafts are not publicly readable, published docs are.
      patch.execute([{ set: { status: 'approved', isActive: true } }, { unset: ['phone'] }]);
      publish.execute();
      props.onComplete();
    },
  };
};

export const RejectReviewAction: DocumentActionComponent = (props) => {
  const { patch, unpublish } = useDocumentOperation(props.id, props.type);
  const doc = (props.draft ?? props.published) as ReviewDoc;
  if (doc?.status === 'rejected' && !props.published) return null;

  return {
    label: 'Reject',
    tone: 'critical',
    onHandle: () => {
      patch.execute([{ set: { status: 'rejected', isActive: false } }]);
      if (props.published) unpublish.execute();
      props.onComplete();
    },
  };
};

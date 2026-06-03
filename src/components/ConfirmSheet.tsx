type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmSheet({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onCancel} />
      <div className="bottom-sheet p-5 z-50">
        <div className="w-10 h-1 bg-[#C6C6C8] rounded-full mx-auto mb-5" />
        <h2 className="text-[20px] font-bold text-[#1C1C1E] mb-2">{title}</h2>
        <p className="text-[15px] text-[#8E8E93] mb-6">{message}</p>
        <button
          onClick={onConfirm}
          className={`w-full ios-btn text-[17px] py-4 ${danger ? 'ios-btn-red' : 'ios-btn-primary'}`}
        >
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          className="w-full mt-2 text-[17px] text-[#8E8E93] py-3 font-medium"
        >
          Cancel
        </button>
      </div>
    </>
  );
}

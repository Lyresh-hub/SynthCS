// Ito yung mga props na kailangan ng parent component para gamitin ang dialog na ito
interface ConfirmDialogProps {
  open:      boolean;   // kung true, lalabas ang dialog; kung false, nakatago
  title:     string;    // yung malaking text sa taas ng dialog
  message:   string;    // yung explanation text sa loob
  confirmLabel?: string; // text ng confirm button (default: "Confirm")
  cancelLabel?:  string; // text ng cancel button (default: "Cancel")
  variant?:  "danger" | "default"; // "danger" = pula ang confirm button para sa mapanganib na aksyon
  onConfirm: () => void; // ito yung tatawaging function kapag pinindot ang confirm
  onCancel:  () => void; // ito naman kapag cancel o pinindot ang likod
}

// Reusable na modal dialog para sa mga aksyong kailangan ng kumpirmasyon.
// Ginagamit ito sa buong app — "Delete dataset?", "Delete schema?", "Log out?", etc.
export default function ConfirmDialog({
  open, title, message,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  variant = "default",
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  // Kapag hindi pa bukas ang dialog, wala talagang irender — malinis ang DOM
  if (!open) return null;

  return (
    // Sumasaklaw sa buong screen at nakatayo sa ibabaw ng lahat (z-50)
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Ito yung madilim na background sa likod ng dialog — kapag pinindot, cancel ang mangyayari */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Ito na yung actual na dialog card */}
      <div className="relative z-10 bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 animate-in">
        <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">{message}</p>

        {/* Mga buttons — Cancel sa kaliwa, Confirm sa kanan */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {cancelLabel}
          </button>
          {/* Pula ang confirm button kapag "danger", purple kapag normal */}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors
              ${variant === "danger"
                ? "bg-red-500 hover:bg-red-600"
                : "bg-purple-600 hover:bg-purple-700"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

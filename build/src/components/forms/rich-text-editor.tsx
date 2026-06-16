import { useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { cn } from "@/utils/cn";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onUploadImage: (file: File) => Promise<string>;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({ value, onChange, onUploadImage, placeholder, className }: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({ openOnClick: false }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[8rem] focus:outline-none",
        "data-placeholder": placeholder ?? "",
      },
    },
  });

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editor) return;

    try {
      const url = await onUploadImage(file);
      editor.chain().focus().setImage({ src: url }).run();
    } catch {
      // Upload errors are surfaced by the caller via toast/error state.
    }
  }

  if (!editor) return null;

  return (
    <div className={cn("rounded-xl border border-[var(--border)] bg-[var(--card)]", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] p-2">
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="B" />
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="I" />
        <ToolbarButton active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} label="S" />
        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="•" />
        <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="1." />
        <ToolbarButton
          active={false}
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          label="🔗"
        />
        <ToolbarButton active={false} onClick={() => fileInputRef.current?.click()} label="🖼" />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs font-semibold transition",
        active ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-[var(--border)]/40",
      )}
    >
      {label}
    </button>
  );
}

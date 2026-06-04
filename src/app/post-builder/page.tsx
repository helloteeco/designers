import PostBuilder from "@/components/PostBuilder";

export const metadata = {
  title: "Post Builder — Design Studio",
  description:
    "Turn competitor posts into your own carousels in your template — with captions and hooks.",
};

export default function PostBuilderPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <PostBuilder />
    </main>
  );
}

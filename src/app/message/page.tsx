import { Suspense } from "react";
import { SimplePage } from "../simple-page";
import { MessageForm } from "./form";

export default function MessagePage({ searchParams }: PageProps<"/message">) {
  return (
    <SimplePage title="给站长留言">
      <p className="galley-lede">留言不会公开，只有站长本人能看到。</p>
      <Suspense fallback={null}>
        <Form searchParams={searchParams} />
      </Suspense>
    </SimplePage>
  );
}

async function Form({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { from } = await searchParams;
  return <MessageForm from={typeof from === "string" ? from : undefined} />;
}

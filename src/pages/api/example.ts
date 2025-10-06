// SSRページの例: このページは動的にレンダリングされます
export const prerender = false;

export async function GET() {
  return new Response(
    JSON.stringify({
      message: "This is a server-side rendered API endpoint",
      timestamp: new Date().toISOString(),
    }),
    {
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

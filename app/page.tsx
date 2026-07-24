import { auth, signIn, signOut } from "@/auth";
import { MoodComposer } from "@/components/MoodComposer";

export default async function Home() {
  const session = await auth();
  const signedIn = !!session?.accessToken && !session.error;

  return (
    <div className="flex flex-1 flex-col items-center px-4 pb-24">
      <header className="w-full max-w-4xl flex items-center justify-between py-6">
        <span className="font-semibold tracking-tight text-lg">
          <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            Moodlist
          </span>
        </span>
        {signedIn ? (
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button className="text-sm text-ink-dim hover:text-ink transition-colors cursor-pointer">
              Sign out{session?.user?.name ? ` (${session.user.name})` : ""}
            </button>
          </form>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("spotify");
            }}
          >
            <button className="cursor-pointer rounded-full border border-line px-4 py-1.5 text-sm text-ink-dim hover:border-accent/50 hover:text-ink transition-colors">
              Connect Spotify
            </button>
          </form>
        )}
      </header>

      <main className="w-full max-w-4xl flex flex-col items-center pt-10 sm:pt-16">
        <h1 className="text-center text-4xl sm:text-5xl font-semibold tracking-tight leading-tight max-w-2xl">
          Tell it how you feel.{" "}
          <span className="bg-gradient-to-r from-accent via-accent-2 to-accent-3 bg-clip-text text-transparent">
            Get the playlist.
          </span>
        </h1>
        <p className="mt-4 text-center text-ink-dim max-w-xl text-base sm:text-lg">
          Instant playlists from a pre-indexed, multilingual catalog of real
          Spotify tracks — Bollywood to K-pop to pure instrumentals. No login to
          explore; connect Spotify only when you want to save one.
        </p>

        <MoodComposer signedIn={signedIn} />
      </main>
    </div>
  );
}

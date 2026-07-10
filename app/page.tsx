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
        {signedIn && (
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
          Live-curated from real Spotify tracks, matched to your mood by what the
          lyrics actually say — then exported to your account in one click.
        </p>

        {signedIn ? (
          <MoodComposer />
        ) : (
          <form
            className="mt-12"
            action={async () => {
              "use server";
              await signIn("spotify");
            }}
          >
            <button className="cursor-pointer rounded-full bg-gradient-to-r from-accent to-accent-2 px-8 py-3.5 font-medium text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 hover:scale-[1.02] active:scale-[0.99] transition-all">
              Connect Spotify to start
            </button>
            <p className="mt-3 text-center text-xs text-ink-dim">
              Needs permission to create playlists — nothing else.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}

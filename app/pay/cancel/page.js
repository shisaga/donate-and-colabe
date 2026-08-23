export default function PayCancel() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="brut-lg bg-white w-full max-w-md p-6 text-center">
        <div className="font-comic text-3xl sm:text-4xl">Payment cancelled</div>
        <p className="text-sm font-semibold mt-2">Nothing was charged and no rank changed. Try again whenever you&apos;re ready to fight for a spot.</p>
        <a href="/#leaderboard" className="brut-btn inline-block mt-4 px-5 py-3 is-pink bg-[#FF5DA2] text-white">Back to the board</a>
      </div>
    </div>
  );
}

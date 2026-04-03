export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse font-mono text-xl">
          <span className="inline-block animate-bounce">◼</span>
          <span className="inline-block animate-bounce delay-100">◼</span>
          <span className="inline-block animate-bounce delay-200">◼</span>
          <span className="ml-2">LOADING</span>
        </div>
      </div>
    </div>
  );
}

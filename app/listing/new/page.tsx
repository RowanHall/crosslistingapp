import { Navbar } from "@/components/layout/Navbar";
import { MasterListingForm } from "@/components/listing/MasterListingForm";

export default function NewListingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-black selection:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 overflow-hidden">
        <MasterListingForm />
      </main>
    </div>
  );
}

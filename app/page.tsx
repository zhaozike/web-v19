import Link from "next/link";
import ButtonSignin from "@/components/ButtonSignin";
import Hero from "@/components/Hero";
import FeaturesGrid from "@/components/FeaturesGrid";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

export default function Page() {
  return (
    <>
      <header className="p-4 flex justify-end max-w-7xl mx-auto">
        <ButtonSignin text="登录" />
      </header>
      <main>
        <Hero />
        <FeaturesGrid />
        <FAQ />
        <Footer />
      </main>
    </>
  );
}

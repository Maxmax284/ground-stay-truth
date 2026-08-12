import EntrySection from "@/components/landing/EntrySection";
import ContextSection from "@/components/landing/ContextSection";
import SystemFlowSection from "@/components/landing/SystemFlowSection";
import FailureSection from "@/components/landing/FailureSection";
import MessagingSection from "@/components/landing/MessagingSection";
import LivingSection from "@/components/landing/LivingSection";
import BuiltFromInsideSection from "@/components/landing/BuiltFromInsideSection";
import ProofSection from "@/components/landing/ProofSection";
import SovereigntySection from "@/components/landing/SovereigntySection";
import ComplianceSection from "@/components/landing/ComplianceSection";
import FinalCTASection from "@/components/landing/FinalCTASection";
import { ReinstallPrompt } from "@/components/ReinstallPrompt";
import Seo from "@/components/Seo";

const LandingPage = () => (
  <main className="min-h-screen">
    <Seo
      path="/"
      title="LMT CampStay — Lamai Muay Thai Camp Stays"
      description="Book official Lamai Muay Thai camp accommodation in Koh Samui. Reserve rooms, pay deposits, and get arrival coordination in one place."
    />
    <ReinstallPrompt />
    <EntrySection />

    <ContextSection />
    <SystemFlowSection />
    <FailureSection />
    <MessagingSection />
    <LivingSection />
    <BuiltFromInsideSection />
    <ProofSection />
    <SovereigntySection />
    <ComplianceSection />
    <FinalCTASection />
  </main>
);

export default LandingPage;

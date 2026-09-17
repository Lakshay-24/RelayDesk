import { notFound } from "next/navigation";
import FixtureClient from "./FixtureClient";

export const dynamic = "force-dynamic";

export default function E2EFixture(){
  if(process.env.RELAYDESK_E2E_FIXTURES!=="1")notFound();
  return <FixtureClient/>;
}

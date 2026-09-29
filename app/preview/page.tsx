import { redirect } from "next/navigation";

export default function PreviewRedirect() {
  redirect("/feed");
}

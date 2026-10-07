declare module "web-push" {
  type PushSubscription = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: PushSubscription,
      payload: string,
      options?: { urgency?: "very-low" | "low" | "normal" | "high"; TTL?: number }
    ): Promise<unknown>;
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
  };

  export default webpush;
}

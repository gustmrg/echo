namespace Echo.API.Messaging;

public static class RoutingKeys
{
    public static class Recording
    {
        public const string TranscriptionRequested =
            "recording.transcription.requested";

        public const string TranscriptionCompleted =
            "recording.transcription.completed";

        public const string RefinementRequested =
            "recording.refinement.requested";

        public const string RefinementCompleted =
            "recording.refinement.completed";
    }
}
namespace Echo.API.Enums;

public enum TranscriptionJobStatus
{
    Unknown = 0,
    Created = 1,
    Processing = 2,
    Completed = 3,
    Failed = 4,
    Error = 5,
}
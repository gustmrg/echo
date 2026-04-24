namespace Echo.Domain.Entities;

public class User
{
    private User() { }

    private User(string email, string auth0Id)
    {
        Id = Guid.CreateVersion7();
        Auth0Id = auth0Id;
        Email = email;
        CreatedAt = DateTime.UtcNow;
    }
    
    public Guid Id { get; set; }
    public string Email { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string Auth0Id { get; set; } = null!;

    public static User Create(string email, string auth0Id)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        ArgumentException.ThrowIfNullOrWhiteSpace(auth0Id);
        
        return new User(email, auth0Id);
    }
    
    public void UpdateEmail(string email)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        Email = email;
        UpdatedAt = DateTime.UtcNow;
    }
}
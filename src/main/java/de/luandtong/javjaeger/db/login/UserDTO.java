package de.luandtong.javjaeger.db.login;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

@Table("users")
public class UserDTO {

    @Id
    private Long id;
    private String username;
    private String password;
    private String hash;

    public UserDTO(Long id, String username, String password, String hash) {
        this.id = id;
        this.username = username;
        this.password = password;
        this.hash = hash;
    }


}

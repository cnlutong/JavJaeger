package de.luandtong.javjaeger.controller;

import de.luandtong.javjaeger.application.service.CookieService;
import de.luandtong.javjaeger.application.service.UserService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.annotation.SessionScope;

@Controller
@SessionScope
@RequestMapping("/")
public class LoginController {

    private final UserService userService;
    private final CookieService cookieService;

    public LoginController(UserService userService, CookieService cookieService) {
        this.userService = userService;
        this.cookieService = cookieService;
    }

    @GetMapping("")
    public String index(Model model) {
        return "redirect:/login";
    }

    @GetMapping("/login")
    public String login1(Model model) {
        return "login";
    }

    @PostMapping("/login")
    public String login(@RequestParam("username") String username,
                        @RequestParam("password") String password,
                        @CookieValue(name= "user_id", defaultValue = "xxxx") String userID,
                        @CookieValue(name= "user_token", defaultValue = "xxxx") String userToken,
                        HttpServletResponse httpServletResponse,
                        Model model) {

        // TODO: 处理用户登录
        if(userService.verification(username, password)){
            userToken = userService.updateLoginHash(username, password);
            userID = Long.toString(userService.getUserIDByHash(username, password));
            cookieService.saveCookie(httpServletResponse, "user_id", userID);
            cookieService.saveCookie(httpServletResponse, "user_token", userToken);
            return "redirect:/home";
        }else {
            model.addAttribute("errorMessage", "Invalid username or password");
            return "login";
        }
    }
}

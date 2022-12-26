package de.luandtong.javjaeger.controller;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.context.annotation.SessionScope;

@Controller
@SessionScope
@RequestMapping("/home")
public class HomeController {

    @GetMapping("")
    public String index(Model model) {
//        return "redirect:/login";
        return "home";
    }
}

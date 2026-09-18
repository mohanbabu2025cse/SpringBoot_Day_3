package com.example.SpringJPA.Controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class WebController {

    @GetMapping("/demo")
    public String demo() {
        return "Food";
    }
}

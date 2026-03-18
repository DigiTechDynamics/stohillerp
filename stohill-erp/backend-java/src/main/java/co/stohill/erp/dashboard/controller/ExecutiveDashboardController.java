package co.stohill.erp.dashboard.controller;

import co.stohill.erp.dashboard.dto.ExecutiveDashboardDto;
import co.stohill.erp.dashboard.service.DashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
public class ExecutiveDashboardController {

    private final DashboardService dashboardService;

    @GetMapping("/executive")
    public ExecutiveDashboardDto getExecutiveDashboard() {
        return dashboardService.getExecutiveStats();
    }
}

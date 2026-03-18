package co.stohill.erp.dashboard.service;

import co.stohill.erp.dashboard.dto.ExecutiveDashboardDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class DashboardService {

    public ExecutiveDashboardDto getExecutiveStats() {
        // In a real app, this would query multiple repositories
        // For now, return mock data matching the frontend's expectations
        return ExecutiveDashboardDto.builder()
                .kpis(ExecutiveDashboardDto.Kpis.builder()
                        .properties(ExecutiveDashboardDto.PropertyKpis.builder()
                                .portfolioValue("125000000")
                                .total(150)
                                .occupied(135)
                                .available(10)
                                .underContract(5)
                                .occupancyRate(90.0)
                                .build())
                        .sales(ExecutiveDashboardDto.SalesKpis.builder()
                                .ytdValue("45000000")
                                .ytdCount(24)
                                .pipelineValue("18000000")
                                .build())
                        .rentals(ExecutiveDashboardDto.RentalKpis.builder()
                                .monthlyIncome("850000")
                                .activeLeases(130)
                                .annualIncome("10200000")
                                .overdueCount(2)
                                .overdueAmount("15000")
                                .build())
                        .crm(ExecutiveDashboardDto.CrmKpis.builder()
                                .totalContacts(1200)
                                .newLeadsThisMonth(45)
                                .build())
                        .commissions(ExecutiveDashboardDto.CommissionKpis.builder()
                                .ytdPaid("2100000")
                                .pending("150000")
                                .build())
                        .build())
                .charts(ExecutiveDashboardDto.Charts.builder()
                        .revenue_trend(List.of(
                                ExecutiveDashboardDto.RevenueTrend.builder().month("Jan").revenue(1200000).build(),
                                ExecutiveDashboardDto.RevenueTrend.builder().month("Feb").revenue(1500000).build(),
                                ExecutiveDashboardDto.RevenueTrend.builder().month("Mar").revenue(1800000).build()))
                        .pipeline_stages(List.of(
                                ExecutiveDashboardDto.PipelineStageData.builder().stage("Initial").count(15)
                                        .value(5000000).color("#E5A645").build(),
                                ExecutiveDashboardDto.PipelineStageData.builder().stage("Viewing").count(8)
                                        .value(3000000).color("#60A5FA").build(),
                                ExecutiveDashboardDto.PipelineStageData.builder().stage("Offer").count(5).value(2500000)
                                        .color("#34D399").build()))
                        .top_agents(List.of(
                                ExecutiveDashboardDto.TopAgent.builder().name("John Doe").employee_number("EMP001")
                                        .deal_count(12).total_commission("500000").build(),
                                ExecutiveDashboardDto.TopAgent.builder().name("Jane Smith").employee_number("EMP002")
                                        .deal_count(10).total_commission("420000").build()))
                        .build())
                .build();
    }
}

package co.stohill.erp.dashboard.dto;

import java.util.List;

public class ExecutiveDashboardDto {
    private Kpis kpis;
    private Charts charts;

    public Kpis getKpis() {
        return kpis;
    }

    public void setKpis(Kpis kpis) {
        this.kpis = kpis;
    }

    public Charts getCharts() {
        return charts;
    }

    public void setCharts(Charts charts) {
        this.charts = charts;
    }

    public static ExecutiveDashboardDtoBuilder builder() {
        return new ExecutiveDashboardDtoBuilder();
    }

    public static class ExecutiveDashboardDtoBuilder {
        private ExecutiveDashboardDto d = new ExecutiveDashboardDto();

        public ExecutiveDashboardDtoBuilder kpis(Kpis k) {
            d.setKpis(k);
            return this;
        }

        public ExecutiveDashboardDtoBuilder charts(Charts c) {
            d.setCharts(c);
            return this;
        }

        public ExecutiveDashboardDto build() {
            return d;
        }
    }

    public static class Kpis {
        private PropertyKpis properties;
        private SalesKpis sales;
        private RentalKpis rentals;
        private CrmKpis crm;
        private CommissionKpis commissions;

        public PropertyKpis getProperties() {
            return properties;
        }

        public void setProperties(PropertyKpis p) {
            this.properties = p;
        }

        public SalesKpis getSales() {
            return sales;
        }

        public void setSales(SalesKpis s) {
            this.sales = s;
        }

        public RentalKpis getRentals() {
            return rentals;
        }

        public void setRentals(RentalKpis r) {
            this.rentals = r;
        }

        public CrmKpis getCrm() {
            return crm;
        }

        public void setCrm(CrmKpis c) {
            this.crm = c;
        }

        public CommissionKpis getCommissions() {
            return commissions;
        }

        public void setCommissions(CommissionKpis c) {
            this.commissions = c;
        }

        public static KpisBuilder builder() {
            return new KpisBuilder();
        }

        public static class KpisBuilder {
            private Kpis k = new Kpis();

            public KpisBuilder properties(PropertyKpis p) {
                k.setProperties(p);
                return this;
            }

            public KpisBuilder sales(SalesKpis s) {
                k.setSales(s);
                return this;
            }

            public KpisBuilder rentals(RentalKpis r) {
                k.setRentals(r);
                return this;
            }

            public KpisBuilder crm(CrmKpis c) {
                k.setCrm(c);
                return this;
            }

            public KpisBuilder commissions(CommissionKpis c) {
                k.setCommissions(c);
                return this;
            }

            public Kpis build() {
                return k;
            }
        }
    }

    public static class PropertyKpis {
        private String portfolioValue;
        private int total;
        private int occupied;
        private int available;
        private int underContract;
        private double occupancyRate;

        // Getters and Setters
        public String getPortfolioValue() {
            return portfolioValue;
        }

        public void setPortfolioValue(String v) {
            this.portfolioValue = v;
        }

        public int getTotal() {
            return total;
        }

        public void setTotal(int t) {
            this.total = t;
        }

        public int getOccupied() {
            return occupied;
        }

        public void setOccupied(int o) {
            this.occupied = o;
        }

        public int getAvailable() {
            return available;
        }

        public void setAvailable(int a) {
            this.available = a;
        }

        public int getUnderContract() {
            return underContract;
        }

        public void setUnderContract(int u) {
            this.underContract = u;
        }

        public double getOccupancyRate() {
            return occupancyRate;
        }

        public void setOccupancyRate(double r) {
            this.occupancyRate = r;
        }

        public static PropertyKpisBuilder builder() {
            return new PropertyKpisBuilder();
        }

        public static class PropertyKpisBuilder {
            private PropertyKpis p = new PropertyKpis();

            public PropertyKpisBuilder portfolioValue(String v) {
                p.setPortfolioValue(v);
                return this;
            }

            public PropertyKpisBuilder total(int t) {
                p.setTotal(t);
                return this;
            }

            public PropertyKpisBuilder occupied(int o) {
                p.setOccupied(o);
                return this;
            }

            public PropertyKpisBuilder available(int a) {
                p.setAvailable(a);
                return this;
            }

            public PropertyKpisBuilder underContract(int u) {
                p.setUnderContract(u);
                return this;
            }

            public PropertyKpisBuilder occupancyRate(double r) {
                p.setOccupancyRate(r);
                return this;
            }

            public PropertyKpis build() {
                return p;
            }
        }
    }

    public static class SalesKpis {
        private String ytdValue;
        private int ytdCount;
        private String pipelineValue;

        public String getYtdValue() {
            return ytdValue;
        }

        public void setYtdValue(String v) {
            this.ytdValue = v;
        }

        public int getYtdCount() {
            return ytdCount;
        }

        public void setYtdCount(int c) {
            this.ytdCount = c;
        }

        public String getPipelineValue() {
            return pipelineValue;
        }

        public void setPipelineValue(String v) {
            this.pipelineValue = v;
        }

        public static SalesKpisBuilder builder() {
            return new SalesKpisBuilder();
        }

        public static class SalesKpisBuilder {
            private SalesKpis s = new SalesKpis();

            public SalesKpisBuilder ytdValue(String v) {
                s.setYtdValue(v);
                return this;
            }

            public SalesKpisBuilder ytdCount(int c) {
                s.setYtdCount(c);
                return this;
            }

            public SalesKpisBuilder pipelineValue(String v) {
                s.setPipelineValue(v);
                return this;
            }

            public SalesKpis build() {
                return s;
            }
        }
    }

    public static class RentalKpis {
        private String monthlyIncome;
        private int activeLeases;
        private String annualIncome;
        private int overdueCount;
        private String overdueAmount;

        public String getMonthlyIncome() {
            return monthlyIncome;
        }

        public void setMonthlyIncome(String v) {
            this.monthlyIncome = v;
        }

        public int getActiveLeases() {
            return activeLeases;
        }

        public void setActiveLeases(int c) {
            this.activeLeases = c;
        }

        public String getAnnualIncome() {
            return annualIncome;
        }

        public void setAnnualIncome(String v) {
            this.annualIncome = v;
        }

        public int getOverdueCount() {
            return overdueCount;
        }

        public void setOverdueCount(int c) {
            this.overdueCount = c;
        }

        public String getOverdueAmount() {
            return overdueAmount;
        }

        public void setOverdueAmount(String v) {
            this.overdueAmount = v;
        }

        public static RentalKpisBuilder builder() {
            return new RentalKpisBuilder();
        }

        public static class RentalKpisBuilder {
            private RentalKpis r = new RentalKpis();

            public RentalKpisBuilder monthlyIncome(String v) {
                r.setMonthlyIncome(v);
                return this;
            }

            public RentalKpisBuilder activeLeases(int c) {
                r.setActiveLeases(c);
                return this;
            }

            public RentalKpisBuilder annualIncome(String v) {
                r.setAnnualIncome(v);
                return this;
            }

            public RentalKpisBuilder overdueCount(int c) {
                r.setOverdueCount(c);
                return this;
            }

            public RentalKpisBuilder overdueAmount(String v) {
                r.setOverdueAmount(v);
                return this;
            }

            public RentalKpis build() {
                return r;
            }
        }
    }

    public static class CrmKpis {
        private int totalContacts;
        private int newLeadsThisMonth;

        public int getTotalContacts() {
            return totalContacts;
        }

        public void setTotalContacts(int c) {
            this.totalContacts = c;
        }

        public int getNewLeadsThisMonth() {
            return newLeadsThisMonth;
        }

        public void setNewLeadsThisMonth(int c) {
            this.newLeadsThisMonth = c;
        }

        public static CrmKpisBuilder builder() {
            return new CrmKpisBuilder();
        }

        public static class CrmKpisBuilder {
            private CrmKpis c = new CrmKpis();

            public CrmKpisBuilder totalContacts(int ct) {
                c.setTotalContacts(ct);
                return this;
            }

            public CrmKpisBuilder newLeadsThisMonth(int ct) {
                c.setNewLeadsThisMonth(ct);
                return this;
            }

            public CrmKpis build() {
                return c;
            }
        }
    }

    public static class CommissionKpis {
        private String ytdPaid;
        private String pending;

        public String getYtdPaid() {
            return ytdPaid;
        }

        public void setYtdPaid(String v) {
            this.ytdPaid = v;
        }

        public String getPending() {
            return pending;
        }

        public void setPending(String v) {
            this.pending = v;
        }

        public static CommissionKpisBuilder builder() {
            return new CommissionKpisBuilder();
        }

        public static class CommissionKpisBuilder {
            private CommissionKpis c = new CommissionKpis();

            public CommissionKpisBuilder ytdPaid(String v) {
                c.setYtdPaid(v);
                return this;
            }

            public CommissionKpisBuilder pending(String v) {
                c.setPending(v);
                return this;
            }

            public CommissionKpis build() {
                return c;
            }
        }
    }

    public static class Charts {
        private List<RevenueTrend> revenue_trend;
        private List<PipelineStageData> pipeline_stages;
        private List<TopAgent> top_agents;

        public List<RevenueTrend> getRevenue_trend() {
            return revenue_trend;
        }

        public void setRevenue_trend(List<RevenueTrend> l) {
            this.revenue_trend = l;
        }

        public List<PipelineStageData> getPipeline_stages() {
            return pipeline_stages;
        }

        public void setPipeline_stages(List<PipelineStageData> l) {
            this.pipeline_stages = l;
        }

        public List<TopAgent> getTop_agents() {
            return top_agents;
        }

        public void setTop_agents(List<TopAgent> l) {
            this.top_agents = l;
        }

        public static ChartsBuilder builder() {
            return new ChartsBuilder();
        }

        public static class ChartsBuilder {
            private Charts c = new Charts();

            public ChartsBuilder revenue_trend(List<RevenueTrend> l) {
                c.setRevenue_trend(l);
                return this;
            }

            public ChartsBuilder pipeline_stages(List<PipelineStageData> l) {
                c.setPipeline_stages(l);
                return this;
            }

            public ChartsBuilder top_agents(List<TopAgent> l) {
                c.setTop_agents(l);
                return this;
            }

            public Charts build() {
                return c;
            }
        }
    }

    public static class RevenueTrend {
        private String month;
        private double revenue;

        public String getMonth() {
            return month;
        }

        public void setMonth(String m) {
            this.month = m;
        }

        public double getRevenue() {
            return revenue;
        }

        public void setRevenue(double r) {
            this.revenue = r;
        }

        public static RevenueTrendBuilder builder() {
            return new RevenueTrendBuilder();
        }

        public static class RevenueTrendBuilder {
            private RevenueTrend t = new RevenueTrend();

            public RevenueTrendBuilder month(String m) {
                t.setMonth(m);
                return this;
            }

            public RevenueTrendBuilder revenue(double r) {
                t.setRevenue(r);
                return this;
            }

            public RevenueTrend build() {
                return t;
            }
        }
    }

    public static class PipelineStageData {
        private String stage;
        private int count;
        private double value;
        private String color;

        public String getStage() {
            return stage;
        }

        public void setStage(String s) {
            this.stage = s;
        }

        public int getCount() {
            return count;
        }

        public void setCount(int c) {
            this.count = c;
        }

        public double getValue() {
            return value;
        }

        public void setValue(double v) {
            this.value = v;
        }

        public String getColor() {
            return color;
        }

        public void setColor(String c) {
            this.color = c;
        }

        public static PipelineStageDataBuilder builder() {
            return new PipelineStageDataBuilder();
        }

        public static class PipelineStageDataBuilder {
            private PipelineStageData d = new PipelineStageData();

            public PipelineStageDataBuilder stage(String s) {
                d.setStage(s);
                return this;
            }

            public PipelineStageDataBuilder count(int c) {
                d.setCount(c);
                return this;
            }

            public PipelineStageDataBuilder value(double v) {
                d.setValue(v);
                return this;
            }

            public PipelineStageDataBuilder color(String c) {
                d.setColor(c);
                return this;
            }

            public PipelineStageData build() {
                return d;
            }
        }
    }

    public static class TopAgent {
        private String name;
        private String employee_number;
        private int deal_count;
        private String total_commission;

        public String getName() {
            return name;
        }

        public void setName(String n) {
            this.name = n;
        }

        public String getEmployee_number() {
            return employee_number;
        }

        public void setEmployee_number(String n) {
            this.employee_number = n;
        }

        public int getDeal_count() {
            return deal_count;
        }

        public void setDeal_count(int c) {
            this.deal_count = c;
        }

        public String getTotal_commission() {
            return total_commission;
        }

        public void setTotal_commission(String v) {
            this.total_commission = v;
        }

        public static TopAgentBuilder builder() {
            return new TopAgentBuilder();
        }

        public static class TopAgentBuilder {
            private TopAgent a = new TopAgent();

            public TopAgentBuilder name(String n) {
                a.setName(n);
                return this;
            }

            public TopAgentBuilder employee_number(String n) {
                a.setEmployee_number(n);
                return this;
            }

            public TopAgentBuilder deal_count(int c) {
                a.setDeal_count(c);
                return this;
            }

            public TopAgentBuilder total_commission(String v) {
                a.setTotal_commission(v);
                return this;
            }

            public TopAgent build() {
                return a;
            }
        }
    }
}
